/* GNSS.fineSearch —— 码相位精修（窄窗 + 高采样率 + 平台质心）
 *
 * 为什么需要它（本轮实测，契约 CONTRACT-v20 §21）：
 *   本工程的中频信号与接收机复制码都是"按采样格硬采样"的 ±1 方波：
 *     signal[j] 的码片号 = floor(j/spc + codePhase)，spc = fs/1.023e6
 *   于是**落在同一采样格内的所有 codePhase 给出逐样本完全相同的码序列** ⇒ 相关值
 *   逐位相同（真的是同一个浮点数）。相关峰顶因此是一段**平台**，宽度恰好
 *      W = 1 采样格 = (1/spc) chip = (c/F_CODE)/spc 米。
 *   实测（review/proto-fine6.js，12 个"跨格"真值、±0.6 chip 窗、4 ms 积分）：
 *     spc   W(米)   送"首个最大"(=W/√3 理论)   送"平台中心"(=W/√12 理论)
 *      4    73.3    48.4 m                     24.1 m
 *     16    18.3    11.3 m                      5.5 m
 *     40     7.3     2.6 m                      2.0 m
 *   注意：**在本场景（平台占优、SNR 未低到跑错平台）提高信噪比完全无效**——平台内的相关值是同一个浮点数，
 *   噪声不改变它（实测 -20 dB 与 60 dB 的估计逐位相同）。但这条**不是无条件**的（ds4.1 子代理的攻击）：
 *   ① 多径/带限失配会打破"码序列恒等"（|a2|=0.9 时 -20 dB 与 60 dB 的估计差 25 m）；
 *   ② SNR 低到约 -35 dB 起会跑错平台（余量最小时只到均值 -2.4σ）。正确措辞是"**已饱和**"。
 *
 *  所以本模块带一个**幅度门**（ds4.1 攻击后补的关键防线）：平台内逐点相等 ⇒ 若粗捕给的码相位已经错了
 *   ≥1 chip（或本振多普勒给错、相关彻底塌掉），窗内**每一个**格点都是旁瓣/噪声，峰形照样是"平台"，
 *  于是静默返回一个错答案。实测：粗值故意偏 3 chip、200 个噪声种子时 `edgeHit` 只报警 40/200 = 20%。
 *  可靠的门是"每样本幅度" ampPerSample = amp / n：码对齐时 ≈ 信号幅度 A（|Σ c·c| = n·A），
 *  滑到旁瓣/噪声时 ≈ 0.03（4 ms 积分）。默认阈值 0.35 ⇒ 弱信号/频率错/粗值错都会被标成 weak=true。
 *
 * 本模块的估计器 = **平台中心**（该采样率下的最小均方误差估计）：
 *   1. 在 ±winChips 窗口内按整数采样格扫描（相关评估次数只有 2·win·spc+1 次）；
 *   2. 取最大值的**连续等值段**（平台）[k_lo, k_hi]（采样格索引）；
 *   3. 平台区间是 [k_lo/spc, (k_hi+1)/spc)，取其中点 —— 默认每平台只含 1 个网格点，
 *      所以等价于"argmax + 半个采样格"；给更细的 stepChips 时自动退化成一般质心。
 *
 * 约定（重要）：本模块的 g 与 makeSignal/acquire 的 codePhase **同向**（复制码按
 * floor(j/spc + g) 生成），**不是** correlateAt 的镜像约定。tests/test-finesearch.js
 * 用"镜像处幅度必须显著更低"反向锁死方向（与 tests/test-signal-conv.js 同一手法）。
 */
(function () {
  'use strict';
  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  var F_CODE = 1.023e6, CA_LEN = 1023, TWO_PI = 2 * Math.PI, SQRT12 = Math.sqrt(12);

  function finiteNumber(v, fb) { return (typeof v === 'number' && isFinite(v)) ? v : fb; }
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function wrapChips(v) { var x = v % CA_LEN; if (x < 0) x += CA_LEN; return x; }
  function wrapOffset(d) { while (d > CA_LEN / 2) d -= CA_LEN; while (d < -CA_LEN / 2) d += CA_LEN; return d; }

  function fail(reason, start) { return { ok: false, reason: reason, elapsedMs: nowMs() - start }; }

  function getCode(prn) {
    if (typeof GNSS.caCode === 'function') { var c = GNSS.caCode(prn); if (c && c.length === CA_LEN) return c; }
    return null;
  }

  /* 带限复制码表：把本地码按**与前端同一个**高斯低通模型采样到 M 个子相位/chip 上（线性插值用）。
     为什么必须有它（本轮实测，v21 §22）：
       相关值之所以在一整格内逐位相同，有**两个**来源——
         (i) 信号侧：接收到的样本是按采样格硬采样的（若前端理想方波，格内信息确实为 0，无法救）；
         (ii) 复制码侧：搜索时把 g 量化到整数样本，复制码序列只在 g 越过样本边界时才变（这是**可以避免的实现伪影**）。
     真实接收机的码 NCO 是**分数延迟**的（复制码在连续位置上取值/或对样本插值），所以 (ii) 不存在。
     这里用与 lib/signal.js 相同的高斯低通模型生成复制码表 ⇒ 只有 (i) 才是真正的物理瓶颈。
     默认 replicaBwHz = signal.bwHz：理想方波信号自动退回旧的硬采样复制码（保证既有判据逐位不变）。 */
  var BL_CACHE = {}, BL_M = 64;
  function blReplica(prn, bwHz, M) {
    if (!(bwHz > 0) || typeof GNSS.frontEndInfo !== 'function') return null;
    /* M=0 ⇒ **精确**复制码：不做查表，逐样本按解析式求值（慢，但用于判据参照，
       用来分离"查表线性插值残差"与"估计器自身偏差"——ds4.1 子代理 C 轮就是这样对照的：
       16 spc 无噪下 M=128 的 0.633 m 与精确复制码的 0.651 m 同量级 ⇒ 残差主要是三点抛物的偏差）。 */
    if (M === 0) {
      var fe0 = GNSS.frontEndInfo(bwHz);
      return { exact: true, sigma: fe0.sigmaChip, K: fe0.K, bwHz: bwHz, subSamples: 0 };
    }
    M = Math.max(8, Math.min(1024, Math.round(M || BL_M)));
    var key = prn + ':' + bwHz + ':' + M;
    if (BL_CACHE[key]) return BL_CACHE[key];
    var fe = GNSS.frontEndInfo(bwHz), sigma = fe.sigmaChip, K = fe.K, L = CA_LEN * M;
    var tab = new Float64Array(L + 1);
    for (var m0 = 0; m0 < CA_LEN; m0++) {
      for (var p = 0; p < M; p++) {
        var u = p / M, acc = 0;
        for (var k = -K; k <= K; k++) {
          var cm = ((m0 + k) % CA_LEN + CA_LEN) % CA_LEN;
          acc += codeAt(prn, cm) * (GNSS.gaussCdf((u - k) / sigma) - GNSS.gaussCdf((u - k - 1) / sigma));
        }
        tab[m0 * M + p] = acc;
      }
    }
    tab[L] = tab[0];
    BL_CACHE[key] = { tab: tab, M: M, L: L, bwHz: bwHz, subSamples: M };
    return BL_CACHE[key];
  }
  function codeAt(prn, idx) { var c = getCode(prn); return c ? c[idx] : 0; }

  /* 相关：先把载波剥掉（一次），再对所有码相位假设复用 —— 平台内逐位相同要靠这一点 */
  function wipeoff(signal, n, dopplerHz) {
    var mi = new Float64Array(n), mq = new Float64Array(n);
    var w = TWO_PI * dopplerHz / signal.fs;
    var cr = 1, ci = 0, wr = Math.cos(w), wi = Math.sin(w);
    for (var j = 0; j < n; j++) {
      if (j !== 0 && (j & 1023) === 0) { var a = j * w; cr = Math.cos(a); ci = Math.sin(a); }
      var ii = signal.i[j], qq = signal.q[j];
      mi[j] = ii * cr + qq * ci;
      mq[j] = -ii * ci + qq * cr;
      var nr = cr * wr - ci * wi; ci = ci * wr + cr * wi; cr = nr;
    }
    return { mi: mi, mq: mq };
  }

  function envelope(w, code, n, spc, gChips, rep) {
    var sI = 0, sQ = 0, mi = w.mi, mq = w.mq, g = gChips, j, cv;
    if (rep && rep.exact) {
      /* 精确（无查表）分数延迟复制码：逐样本解析求值 */
      var sg = rep.sigma, Kx = rep.K;
      for (j = 0; j < n; j++) {
        var tau = j / spc + g, n0 = Math.floor(tau), u = tau - n0;
        cv = 0;
        for (var k = -Kx; k <= Kx; k++) {
          var cm = ((n0 + k) % CA_LEN + CA_LEN) % CA_LEN;
          cv += code[cm] * (GNSS.gaussCdf((u - k) / sg) - GNSS.gaussCdf((u - k - 1) / sg));
        }
        sI += mi[j] * cv; sQ += mq[j] * cv;
      }
    } else if (rep) {
      /* 分数延迟复制码：在 τ = j/spc + g 处线性插值查表（表本身是按同一前端模型算的） */
      var tab = rep.tab, M = rep.M, L = rep.L, st = 1 / spc, i0, tt, pos;
      for (j = 0; j < n; j++) {
        pos = (j * st + g) * M;
        i0 = Math.floor(pos); tt = pos - i0;
        i0 = i0 % L; if (i0 < 0) i0 += L;
        cv = tab[i0] * (1 - tt) + tab[i0 + 1] * tt;
        sI += mi[j] * cv; sQ += mq[j] * cv;
      }
    } else {
      for (j = 0; j < n; j++) {
        var idx = Math.floor(j / spc + g) % CA_LEN;
        if (idx < 0) idx += CA_LEN;
        cv = code[idx];
        sI += mi[j] * cv; sQ += mq[j] * cv;
      }
    }
    return Math.sqrt(sI * sI + sQ * sQ);
  }

  function fineSearch(signal, coarseChips, opts) {
    var start = nowMs();
    var o = opts || {};
    if (!signal || !signal.i || !signal.q) return fail('invalid signal', start);
    if (typeof signal.i.length !== 'number' || signal.i.length !== signal.q.length) return fail('i/q length mismatch', start);
    if (!(typeof signal.n === 'number' && isFinite(signal.n) && signal.n > 0)) return fail('invalid n', start);
    if (!(typeof signal.fs === 'number' && isFinite(signal.fs) && signal.fs > 0)) return fail('invalid fs', start);
    if (!(typeof coarseChips === 'number' && isFinite(coarseChips))) return fail('invalid coarseChips', start);

    var fs = signal.fs, spc = fs / F_CODE;
    if (!(spc >= 1)) return fail('sample rate below 1 sample/chip', start);
    var code = getCode(signal.prn);
    if (!code) return fail('invalid PRN or caCode not loaded', start);

    var signalMs = finiteNumber(signal.ms, signal.n / fs * 1000);
    var ms = Math.min(finiteNumber(o.ms, signalMs), signalMs);
    if (!(ms > 0)) return fail('invalid ms', start);
    var n = Math.min(signal.n, Math.round(fs * ms / 1000), signal.i.length || signal.n);
    if (n < CA_LEN * spc) return fail('shorter than one code period', start);
    for (var vj = 0; vj < n; vj++) if (!isFinite(signal.i[vj]) || !isFinite(signal.q[vj])) return fail('non-finite sample', start);

    var winChips = finiteNumber(o.winChips, 0.5);
    /* 别静默夹紧：ds4.1 攻击发现 winChips=0 / -5 会被悄悄改成 0.05 而"看起来正常"。
       winChips=0 现在是**显式支持**的诊断模式：只在给定中心做一次相关（返回该点的幅度，
       chips 原样返回），用来量"相关曲线在这一点上到底是什么值"（判据里用它证明平台逐位相等）。 */
    if (!(winChips >= 0) || !(winChips <= 32)) return fail('invalid winChips (must be in [0, 32] chip)', start);
    var stepChips = finiteNumber(o.stepChips, 1 / spc);          /* 默认 = 一个采样格 */
    if (!(stepChips > 0)) return fail('invalid stepChips', start);
    var dopplerHz = finiteNumber(o.dopplerHz, finiteNumber(signal.dopplerHz, 0));
    /* 默认 'auto'：用**机制**判峰顶是"平台"还是"光滑丘"，而不是让调用方声明模式。
       判据：在峰值 g* 右侧 step/8 处再算一次相关；若与峰值**逐位相同** ⇒ 采样格量化造成的平台
       （此时必须用平台中心，抛物插值恒给 +半格、什么也不做）；否则 ⇒ 光滑丘（用三点抛物）。 */
    var estimator = o.estimator || 'auto';
    if (estimator !== 'auto' && estimator !== 'centroid' && estimator !== 'argmax' && estimator !== 'parab') return fail('unknown estimator: ' + estimator, start);
    var tol = finiteNumber(o.tol, 1e-9);
    if (!(tol > 0) || !(tol < 0.5)) return fail('invalid tol (must be in (0, 0.5))', start);   /* tol=1e300 曾把"平台"撑成整窗（311 m） */
    var minAmpPerSample = finiteNumber(o.minAmpPerSample, 0.35);
    /* 复制码带宽：默认跟随信号的 bwHz（理想方波信号 → 0 → 旧硬采样复制码，逐位不变） */
    var replicaBwHz = o.replicaBwHz == null ? finiteNumber(signal.bwHz, 0) : o.replicaBwHz;
    var rep = blReplica(signal.prn, replicaBwHz, o.replicaSubSamples);
    var maxEvals = finiteNumber(o.maxEvals, 4000);

    var c0 = wrapChips(coarseChips);
    var half = Math.ceil(winChips / stepChips);
    if (2 * half + 1 > maxEvals) return fail('search window too large (evals=' + (2 * half + 1) + ')', start);

    var w = wipeoff(signal, n, dopplerHz);
    var k0 = Math.round(c0 / stepChips) - half;
    var vals = new Float64Array(2 * half + 1);
    var bestI = 0, evals = 0, i;
    for (i = 0; i < vals.length; i++) {
      var g = (k0 + i) * stepChips;
      vals[i] = envelope(w, code, n, spc, g, rep);
      evals++;
      if (vals[i] > vals[bestI]) bestI = i;
    }
    var peak = vals[bestI];

    /* 平台：与峰值"逐位相同"的连续段。用相对容差而不是 === ，兼容调用方自己的相关实现 */
    var th = peak * (1 - tol);
    var lo = bestI, hi = bestI;
    while (lo > 0 && vals[lo - 1] >= th) lo--;
    while (hi < vals.length - 1 && vals[hi + 1] >= th) hi++;
    var edgeHit = vals.length > 1 && (lo === 0 || hi === vals.length - 1);   /* 单点模式不报 edgeHit */

    var gEst, plateauProbe = null, denseEvals = 0;
    if (estimator === 'auto' || estimator === 'parab') {
      var h = stepChips / 8, gPk = (k0 + bestI) * stepChips;
      var vR = envelope(w, code, n, spc, gPk + h, rep); evals++;
      plateauProbe = (vR === peak);
      if (estimator === 'auto') estimator = plateauProbe ? 'centroid' : 'parab-fine';
      if (estimator === 'parab-fine') {
        /* 第二阶段：光滑丘在粗网格（1/spc）上定位太粗，必须以 step/8 在峰附近重扫一次再拟合三点抛物。
           实测（4 采样/chip、4 MHz 前端、无噪 12 真值）：只用粗网格 35.66 m；加密后 11.04 m。
           代价：+17 次相关（16spc 时 19 → 35 次，仍然只有全码搜索的零头）。 */
        var st8 = stepChips / 8, kBest = 0, vBest = -1, kk;
        for (kk = -8; kk <= 8; kk++) { var vk = envelope(w, code, n, spc, gPk + kk * st8, rep); evals++; denseEvals++; if (vk > vBest) { vBest = vk; kBest = kk; } }
        var y1 = envelope(w, code, n, spc, gPk + (kBest - 1) * st8, rep), y3 = envelope(w, code, n, spc, gPk + (kBest + 1) * st8, rep);
        evals += 2; denseEvals += 2;
        var den2 = y1 - 2 * vBest + y3, off2 = den2 !== 0 ? 0.5 * (y1 - y3) / den2 * st8 : 0;
        gEst = (isFinite(off2) && Math.abs(off2) <= st8) ? gPk + kBest * st8 + off2 : gPk + kBest * st8;
      } else if (estimator === 'parab') {
        var vL = envelope(w, code, n, spc, gPk - h, rep); evals++;
        var den3 = vL - 2 * peak + vR, off3 = den3 !== 0 ? 0.5 * (vL - vR) / den3 * h : 0;
        gEst = (isFinite(off3) && Math.abs(off3) <= 2 * h) ? gPk + off3 : gPk;
      }
    }
    if (gEst === undefined && estimator === 'argmax') gEst = (k0 + bestI) * stepChips;
    else if (estimator === 'parab' && gEst === undefined) {
      /* 抛物插值（三点）：平台只有 1 点时才有意义；平台上取它是经典的错（差 2 倍） */
      if (bestI > 0 && bestI < vals.length - 1) {
        var y1 = vals[bestI - 1], y2 = vals[bestI], y3 = vals[bestI + 1], den = y1 - 2 * y2 + y3;
        var off = den !== 0 ? 0.5 * (y1 - y3) / den * stepChips : 0;
        if (!isFinite(off) || Math.abs(off) > stepChips) off = 0;
        gEst = (k0 + bestI) * stepChips + off;
      } else gEst = (k0 + bestI) * stepChips;
    } else if (gEst === undefined) {
      /* 平台区间 = [k_lo·step, (k_hi+1)·step)，取中点 */
      gEst = (k0 + lo + (hi - lo + 1) / 2) * stepChips;
    }

    /* 两个**不同**的量（ds4.1 攻击指出原名有歧义）：
       · plateauChips/M    = 本次扫描**观测到**的等值段宽 = (hi-lo+1)·step（≥ step，≤ 1/spc；默认 step=1/spc 时 = 1 采样格）
       · resolutionChips/M = 信号模型的**平台宽** = 1 采样格 = c/fs：采样率决定的分辨率元，与 step 无关
       sigmaM 用后者算（信息下限），不要用"观测到的等值段宽"（step 取粗会偏小、取细会偏大）。 */
    var plateauChips = (hi - lo + 1) * stepChips;
    var resolutionChips = 1 / spc;
    var ampPerSample = n > 0 ? peak / n : 0;
    return {
      ok: true, reason: null,
      chips: wrapChips(gEst),
      coarseChips: c0,
      offsetChips: wrapOffset(wrapChips(gEst) - c0),
      amp: peak,
      ampPerSample: ampPerSample,
      weak: !(ampPerSample >= minAmpPerSample),
      plateauChips: plateauChips,
      plateauM: plateauChips * GNSS.CONST.c / F_CODE,
      resolutionChips: resolutionChips,
      resolutionM: resolutionChips * GNSS.CONST.c / F_CODE,
      sigmaChips: resolutionChips / SQRT12,
      sigmaM: resolutionChips / SQRT12 * GNSS.CONST.c / F_CODE,
      edgeHit: edgeHit,
      estimator: estimator,
      plateauDetected: plateauProbe,
      denseEvals: denseEvals,
      replicaBwHz: replicaBwHz,
      interpolatedReplica: !!rep,
      replicaSubSamples: rep ? (rep.exact ? 'exact' : rep.subSamples) : 0,
      minAmpPerSample: minAmpPerSample,
      evals: evals,
      samples: n,
      stepChips: stepChips,
      dopplerHz: dopplerHz,
      elapsedMs: nowMs() - start
    };
  }

  /* 该采样率下的信息下限（米）：一个采样格宽 W = 1/spc chip 的均匀分布标准差 = W/√12 */
  function codePhaseFloorM(fs) { return (GNSS.CONST.c / F_CODE) / (fs / F_CODE) / SQRT12; }

  /* 可复用的"生成器约定"相关包络（供 DLL 等模块用，替代 correlateAt 的镜像约定）。
     opts: { dopplerHz, ms, replicaBwHz（默认跟随 signal.bwHz）, replicaSubSamples }
     默认（signal.bwHz 未设）与 correlateAt 数值一致 —— tests/test-dll.js 是回归证据。 */
  function codeEnv(signal, gChips, opts) {
    var o = opts || {};
    if (!signal || !signal.i || !signal.q) return NaN;
    var spc = signal.fs / F_CODE;
    if (!(spc >= 1)) return NaN;
    var code = getCode(signal.prn); if (!code) return NaN;
    var ms = finiteNumber(o.ms, finiteNumber(signal.ms, signal.n / signal.fs * 1000));
    var n = Math.min(signal.n, Math.round(ms * signal.fs / 1000), signal.i.length);
    if (!(n > 0)) return NaN;
    var rep = blReplica(signal.prn, o.replicaBwHz == null ? finiteNumber(signal.bwHz, 0) : o.replicaBwHz, o.replicaSubSamples);
    var w = wipeoff(signal, n, finiteNumber(o.dopplerHz, finiteNumber(signal.dopplerHz, 0)));
    return envelope(w, code, n, spc, gChips, rep);
  }

  GNSS.fineSearch = fineSearch;
  GNSS.codeEnv = codeEnv;
  GNSS.codePhaseFloorM = codePhaseFloorM;
})();
