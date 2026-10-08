/* 面板九：冷启动（TTFF）+ 多历元平均——信号 → 捕获 → 码相位 → 伪距整数重建 → 首次定位
 * 纯逻辑（重建/模糊度修复）可在 Node 里单独验证：APP.coldstartReconstruct / APP.coldstartSolve */
(function () {
  'use strict';
  var APP = globalThis.GLAPP = globalThis.GLAPP || {};
  var G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }

  APP.panels = APP.panels || {};
  var st = { n: 6, epochs: 8, mode: 'dll', stepS: 0.1, useKF: true, ionoMode: 'model', ionoAct: 1, snrDb: -20,
    fineSpc: 16, fineMs: 0, fineN: 0, finePlateauM: NaN, fineSigmaM: NaN, fineEdge: 0,
    fineWeak: 0, fineErr0Sum: 0, fineN0: 0, frontBw: 0, fineSmooth: 0, fineEstimator: '',
    items: [], est: [], trueChips: [], errCurve: [], chipCurve: [],
    ttff: 0, trackMs: 0, trackN: 0, unlocked: 0, prevSig: [], prevChips: [], prevDop: [],
    sol: null, err: NaN, running: false, phase: '', progress: 0 };
  var CLOCK_M = 41234.5;
  /* 载波环的真实更新率：4 ms 一个积分块。面板的"历元"是 0.1 s，所以一个历元内要跑 FINE_M 个细块——
     0.1 s 间隔直接喂 PLL 时，每历元相位推进 2π·Δf·0.1 可达多次 2π，环路牵入需上万历元（= 白搭）。 */
  var FINE_M = 25, FINE_DT = 0.004;                                  // 接收机钟差（米）≈ 0.1376 ms
  var APPROX = { dx: 8000, dy: -12000, dz: 6000 };         // 冷启动的粗略位置先验（±15 km）

  function chipM() { return G.CONST.c / G.CONST.F_CODE; }
  function codeLenM() { return chipM() * G.CONST.CA_LEN; }
  function wrapChip(d) { while (d > G.CONST.CA_LEN / 2) d -= G.CONST.CA_LEN; while (d < -G.CONST.CA_LEN / 2) d += G.CONST.CA_LEN; return d; }
  function dopplerOf(sat, rec, tSec) {
    var DT = 0.05, A = APP.satsAt(tSec - DT), B = APP.satsAt(tSec + DT), a = null, b = null, i;
    for (i = 0; i < A.length; i++) if (String(A[i].prn) === String(sat.prn)) a = A[i];
    for (i = 0; i < B.length; i++) if (String(B[i].prn) === String(sat.prn)) b = B[i];
    if (!a || !b) return 0;
    var v = { x: (b.x - a.x) / (2 * DT), y: (b.y - a.y) / (2 * DT), z: (b.z - a.z) / (2 * DT) };
    var dx = sat.x - rec.x, dy = sat.y - rec.y, dz = sat.z - rec.z, r = Math.hypot(dx, dy, dz);
    return -(v.x * dx + v.y * dy + v.z * dz) / r * G.CONST.F_L1 / G.CONST.c;
  }
  /* 码相位精修。注意两套镜像约定（详见 lib/signal.js 的注释与 tests/test-signal-conv.js）：
     acquire() 给的 phase0 是"生成器约定"（码超前为正），而 correlateAt(sig, s) 的 s 是
     "复制码延迟"，峰在 s = N − g·SPC。若直接在 phase0 附近搜，搜到的是去相关区（纯噪声，
     实测会灌入 100~200 m 误差），必须先折到镜像位置、搜完再折回来。 */
  function refinePhase(sig, phase0, dop) {
    var fs = sig.fs, spc = fs / 1023e3, N = 1023 * spc;
    var wrap = function (v) { return ((v % N) + N) % N; };
    var g0 = phase0 * 1023 / (fs * 0.001);
    var center = Math.round(wrap(G.chipsToCorrelateOffset(g0, fs)));
    var best = { d: 0, v: -1 }, d;
    for (d = -3; d <= 3; d++) { var v = G.correlateAt(sig, center + d, dop, sig.ms); if (v > best.v) best = { d: d, v: v }; }
    var y1 = G.correlateAt(sig, center + best.d - 1, dop, sig.ms), y2 = best.v, y3 = G.correlateAt(sig, center + best.d + 1, dop, sig.ms);
    var den = y1 - 2 * y2 + y3;
    var off = den !== 0 ? 0.5 * (y1 - y3) / den : 0;
    if (!isFinite(off)) off = 0;
    var sM = wrap(center + best.d + Math.max(-0.9, Math.min(0.9, off)));
    return G.correlateOffsetToChips(sM, fs) * spc;   /* 折回生成器约定的采样表示，保持调用方语义不变 */
  }
  /* 伪距整数重建：码相位只给"模 1 ms"的量，用粗略位置 + 粗略钟差选整毫秒 */
  APP.coldstartReconstruct = function (items, approx, clockGuessM) {
    var L = codeLenM();
    return items.map(function (it) {
      var coarse = Math.hypot(it.sat.x - approx.x, it.sat.y - approx.y, it.sat.z - approx.z);
      var frac = ((it.chips * chipM()) % L + L) % L;
      var bestK = 0, bestErr = Infinity;
      for (var k = 0; k < 100; k++) {
        var cand = frac + k * L, e = Math.abs(cand - (coarse + clockGuessM));
        if (e < bestErr) { bestErr = e; bestK = k; }
      }
      return { prn: it.sat.prn, x: it.sat.x, y: it.sat.y, z: it.sat.z, prM: frac + bestK * L, integerMs: bestK };
    });
  };
  /* 模糊度修复：残差超过半个码周期（≈150 km）时把该星挪一个整毫秒再解 */
  APP.coldstartSolve = function (items, approx, clockGuessM) {
    var meas = APP.coldstartReconstruct(items, approx, clockGuessM);
    var sol = G.solvePosition(meas, { guess: approx });
    if (sol && sol.ok && sol.residuals) {
      var L = codeLenM(), fixed = 0;
      for (var i = 0; i < meas.length; i++) {
        if (Math.abs(sol.residuals[i]) > 0.5 * L) { meas[i].prM += (sol.residuals[i] > 0 ? -L : L); fixed++; }
      }
      if (fixed) sol = G.solvePosition(meas, { guess: approx });
    }
    return { meas: meas, sol: sol };
  };

  /* 历元 e 对应的接收机时刻（秒）：历元间隔 st.stepS 决定码相位漂移量
     —— 0.1 s 间隔 + 800 m/s 视向速度 → 每历元约 0.27 chip（79 m），与跟踪环对比面板同量级 */
  function epochTimeSec(e) { return (APP.state.hours + e * st.stepS / 3600) * 3600; }
  function setup() {
    var S = APP.state, rec = G.ecefFromGeodetic(S.lat, S.lon, 50);
    var sats0 = G.visible(APP.satsAt(epochTimeSec(0)), rec, 10).slice(0, st.n);
    return { rec: rec, sats0: sats0 };
  }
  function satAtEpoch(prn, e) {
    var list = APP.satsAt(epochTimeSec(e));
    for (var i = 0; i < list.length; i++) if (String(list[i].prn) === String(prn)) return list[i];
    return null;
  }
  function toChips(samples) {
    var c = samples * G.CONST.CA_LEN / (4092000 * 0.001);
    return ((c % G.CONST.CA_LEN) + G.CONST.CA_LEN) % G.CONST.CA_LEN;
  }
  /* 电离层斜距延迟（L1）。三情景的等价建模：
     - none  ：观测里带全斜距电离层 I
     - model ：只剩模型残差 0.3·I（Klobuchar 大约改掉 70%）
     - dual  ：电离层精确消掉，但组合把噪声放大 2.978× → 等价把信噪比降 20·log10(2.978)=9.48 dB */
  var IONO_CORR = 0.7, DUAL_AMP = 2.978255, DUAL_DB = -20 * Math.log10(2.978255);
  function ionoSlant(rec, sat, tSec) {
    if (typeof G.ionoDelay !== 'function') return { I: 0, valid: false };
    var A0 = (APP.panels.atm && APP.panels.atm.alpha0) ? APP.panels.atm.alpha0() : [2.5e-8, 0, -1.2e-7, 0];
    var alpha = A0.map(function (v) { return v * st.ionoAct; });
    var r = G.ionoDelay(rec, { x: sat.x, y: sat.y, z: sat.z }, tSec, { fHz: 1575.42e6, alpha: alpha });
    return { I: (r && isFinite(r.slantM)) ? r.slantM : 0, valid: !!(r && r.valid), elev: r ? r.elevDeg : NaN };
  }
  function ionoEff(I) {
    if (st.ionoMode === 'none') return I;
    if (st.ionoMode === 'model') return (1 - IONO_CORR) * I;
    return 0;                                  /* dual */
  }
  /* L1 码相位噪声实测 ~25 m（面板 chipsRms 一直显示 24–37 m）。双频组合把伪距噪声放大 2.978×，
     但**不改变各频的捕获/跟踪信噪比**（真实接收机逐频捕获），所以保留 L1 的 −20 dB，
     只在码相位上注入额外噪声使总噪声恰为 2.978×：σ_extra = 25·√(2.978²−1) ≈ 70 m。 */
  var L1_CODE_SIGMA_M = 25;                       /* −20 dB 时的实测量 */
  /* 码相位噪声随电压信噪比线性变化：σ(snrDb) = 25·10^((−20−snrDb)/20) */
  function codeSigmaM() { return L1_CODE_SIGMA_M * Math.pow(10, (-20 - st.snrDb) / 20); }
  function dualExtraChip() { return codeSigmaM() * Math.sqrt(DUAL_AMP * DUAL_AMP - 1) / (G.CONST.c / G.CONST.F_CODE); }
  function dualExtraChips(seed) {
    if (st.ionoMode !== 'dual') return 0;
    var rnd = G.mulberry32(seed >>> 0);
    var u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * dualExtraChip();
  }
  function snrEff() { return st.snrDb; }
  function signalOf(sat, rec, seed, tSec, carrRad) {
    var range = Math.hypot(sat.x - rec.x, sat.y - rec.y, sat.z - rec.z);
    var io = ionoSlant(rec, sat, tSec);
    var ioUsed = ionoEff(io.I);
    var trueChips = ((range + CLOCK_M + ioUsed) / chipM() % G.CONST.CA_LEN + G.CONST.CA_LEN) % G.CONST.CA_LEN;
    var dop = dopplerOf(sat, rec, tSec);
    var fs = 4092000;
    var prnUse = (APP.codePrnOf ? APP.codePrnOf(sat.prn) : 1);
    /* 前端带宽（IF 滤波）：0 = 理想方波（旧模型，峰顶是平台）；>0 = 高斯低通的带限码（峰顶是光滑丘）。
       带限时 winners/finesearch.js 会自动换成**分数延迟复制码**（replicaBwHz 默认跟随 signal.bwHz），
       峰顶才真的是光滑丘 —— 见 CONTRACT-v21 §22 的 2×2 交叉实验。 */
    var bwHz = st.frontBw * 1e6;
    var sig = G.makeSignal({ prn: prnUse, codePhase: trueChips, dopplerHz: dop, bwHz: bwHz,
      carrierPhaseRad: carrRad || 0, snrDb: snrEff(), ms: 4, seed: seed, fs: fs });
    /* 接收机的 ADC 档：两级搜索的第二级与 DLL 跟踪都在这一档上跑。
       4 采样/chip 那路只服务**粗捕**（真实接收机也常用降采样做粗搜：粗捕代价由与 fs 无关的
       1023² 循环相关主导，实测 16 采样/chip 的粗捕只比 4 采样/chip 贵 1.37 倍，见 tests/test-finesearch.js）。
       codePhase/dop/初相与低采样率那路是同一物理信号（4 采样/chip 的样本是子集：j=4m 时 floor(4m/16+g)=floor(m/4+g)）。 */
    var sigHi = null;
    if (st.fineSpc > 4 && typeof G.makeSignal === 'function' && st.fineSpc !== 4) {
      sigHi = G.makeSignal({ prn: prnUse, codePhase: trueChips, dopplerHz: dop, bwHz: bwHz,
        carrierPhaseRad: carrRad || 0, snrDb: snrEff(), ms: 4, seed: seed, fs: st.fineSpc * 1.023e6 });
    }
    if (!st.ionoMax || io.I > st.ionoMax) st.ionoMax = io.I;
    return { sig: sig, sigHi: sigHi, trueChips: trueChips, dop: dop, ionoM: ioUsed, ionoFullM: io.I, elevDeg: io.elev };
  }
  /* 两级搜索的第二级：在**高采样率**信号的窄窗内重做相关，取**平台中心**。
     为什么必须换采样率（本轮实测，契约 CONTRACT-v20 §21）：
       信号与复制码都是按采样格硬采样的方波 ⇒ 同一采样格内的码相位给出**逐样本完全相同**的
       码序列，相关值**逐位相同**。峰顶是一段宽 W = 1 采样格 = (c/F_CODE)/spc 米的平台：
         · 取"首个最大" = 平台左边缘 → 偏差 ≈ −W/2，RMS ≈ W/√3（老 refinePhase 走的就是这条）
         · 取"平台中心"       → 无偏，RMS = W/√12（winners/finesearch.js 的默认估计器）
       所以 4 采样/chip（W=73 m）老做法 42 m → 平台中心 21 m；16 采样/chip 18.3 m → 5.3 m。
       **提高信噪比完全无效**（平台内是同一个浮点数，−20 dB 与 60 dB 估计逐位相同）。
       代价：窄窗只扫 2·0.5·spc+1 个格点（17/41），实测只占全码捕获的 3%–9%。 */
  function fineRefine(built, phaseSamples, dopHz) {
    var coarse = toChips(phaseSamples);
    var fallback = function () { return { chips: toChips(refinePhase(built.sig, phaseSamples, dopHz)), used: false }; };
    if (typeof G.fineSearch !== 'function') return fallback();
    var sigUse = built.sigHi || built.sig;        /* ADC 档没有就用 4 采样/chip（仍拿平台质心的无偏性） */
    var f = G.fineSearch(sigUse, coarse, { dopplerHz: dopHz, winChips: 0.5 });
    if (!f.ok) return fallback();
    /* 幅度门（ds4.1 子代理攻击后补的关键防线）：平台内逐点相等 ⇒ 粗值错了 ≥1 chip 时，
       窗内每个格点都是旁瓣/噪声，峰形照样长成"平台"，`edgeHit` 只报警 20%（200 种子实测 40/200）。
       可靠的门是每样本幅度 ampPerSample（对齐≈1、旁瓣/噪声≈0.03）。weak 就退回老的精修并计数。 */
    if (f.weak) { st.fineWeak++; return fallback(); }
    st.fineMs += f.elapsedMs; st.fineN++;
    st.finePlateauM = f.plateauM; st.fineSigmaM = f.sigmaM;
    if (f.edgeHit) st.fineEdge++;
    if (f.plateauDetected === false) st.fineSmooth++;      /* auto 判为"光滑丘"（带限前端才会） */
    st.fineEstimator = f.estimator;
    return { chips: f.chips, used: true, plateauM: f.plateauM, sigmaM: f.sigmaM };
  }
  /* 冷启动动作：二维捕获 + 码相位精修（计入 TTFF） */
  function acquireOne(built, seed) {
    var t0 = performance.now();
    /* 频率网格取 50 Hz（默认 250 Hz 太粗）：残差 ≤25 Hz 时，4 ms 细块的相位推进 <0.63 rad，
       载波环才能在一次冷启动的时长内牵入；代价是搜索格数 ×5（TTFF 变贵）——这正是真实接收机的权衡。 */
    var r = G.acquire(built.sig, { dopplerStepHz: 100 });
    /* 单位坑：fineRefine 统一返回**chip**（fineSearch 与 refinePhase 两条路的输出都已折成
       makeSignal/acquire 约定的 chip），不要再过 toChips()——那是"采样→chip"的换算（除以 4），
       多折一次会让码相位小 4 倍（实测码相位 RMS 直接爆到 89 km，本轮踩过）。 */
    var fine = fineRefine(built, r.codePhaseSamples, r.dopplerHz);
    var ms = performance.now() - t0;
    var chClean = ((fine.chips % G.CONST.CA_LEN) + G.CONST.CA_LEN) % G.CONST.CA_LEN;
    /* 首历元精修自己的 RMS（口径警告：面板之前把 st.chipsRms 当"精修精度"显示，那其实是
       **末历元 DLL 跟踪**的 RMS；ds4.1 复算确认。这里分开记，避免再把两个口径混起来。 */
    if (fine.used) { st.fineErr0Sum += Math.pow(wrapChip(chClean - built.trueChips) * chipM(), 2); st.fineN0++; }
    /* 双频档的额外噪声只进"测量值"，不进 DLL/PLL 的跟踪锚点——否则噪声会积累成随机游走
       （实测：注入锚点会让末历元误差涨到 263 m）。 */
    var chMeas = ((chClean + dualExtraChips(seed || 1)) % G.CONST.CA_LEN + G.CONST.CA_LEN) % G.CONST.CA_LEN;
    return { chips: chClean, chipsMeas: chMeas, ms: ms, dopplerHz: r.dopplerHz,
      peakSigma: r.peakSigma, detected: r.detected, dopErr: Math.abs(r.dopplerHz - built.dop) };
  }
  /* 跟踪态动作：拿上一历元与本历元两个信号喂给 DLL（init = 上一历元环路输出），
     每次只做 2 组窄相关，所以比重新捕获便宜两个数量级 */
  function trackOne(prev, cur, initChips, initDop, seed) {
    var t0 = performance.now();
    /* 跟踪也用 ADC 档：DLL 的判别器是平台型（平台内 E=L、环路就地停在平台里），
       4 采样/chip 时它只能到 ≈21 m，必须和高采样率一起用才有意义 */
    var out = G.trackDll([prev.sigHi || prev.sig, cur.sigHi || cur.sig], { init: { chips: initChips, dopplerHz: initDop } });
    var ms = performance.now() - t0;
    var ch = out.chips.length ? out.chips[out.chips.length - 1] : initChips;
    var chMeas = ((ch + dualExtraChips(seed || 1)) % G.CONST.CA_LEN + G.CONST.CA_LEN) % G.CONST.CA_LEN;
    return { chips: ch, chipsMeas: chMeas, ms: ms, locked: out.locked };
  }
  /* 兼容旧调用：单颗卫星的一次捕获（等价于第 0 历元） */
  function measureOne(sat, rec, seed) {
    var built = signalOf(sat, rec, seed, epochTimeSec(0));
    var a = acquireOne(built, 3000);
    return { prn: sat.prn, ms: a.ms, chips: a.chipsMeas, trueChips: built.trueChips,
      chipsErrM: wrapChip(a.chipsMeas - built.trueChips) * chipM(), dopErr: a.dopErr, peakSigma: a.peakSigma, detected: a.detected };
  }

  function step(e, k) {
    var info = st.info;
    if (!info || !info.sats0.length) { st.running = false; st.phase = '可见卫星不足'; render(); return; }
    if (e >= st.epochs) {
      /* finish() 的收尾（载波环 + Hatch + 卡尔曼）已按卫星分片，但**调用之间必须让出一帧**，
         否则状态行只是写进 DOM、永远不上屏（ds4.1 代理 Nietzsche 实测：9 次运行 0 帧命中）。 */
      st.phase = '正在做载波环 / Hatch / 卡尔曼后处理（每颗星依次让出，约 1–2 秒）';
      updateProgressUI();
      setTimeout(function () { finish(info); }, 0);
      return;
    }
    if (k >= info.sats0.length) { st.progress = (e + 1) / st.epochs; render(); setTimeout(function () { step(e + 1, 0); }, 0); return; }
    var prn = info.sats0[k].prn;
    var satE = satAtEpoch(prn, e) || info.sats0[k];
    if (!st.sigs[k]) { st.sigs[k] = []; st.carr[k] = 0; st.fine[k] = []; st.truePhase[k] = []; st.truePhaseRes[k] = []; }
    var built = signalOf(satE, info.rec, 3000 + e * 97 + k, epochTimeSec(e), st.carr[k]);
    st.sigs[k][e] = built.sig;
    if (!st.est[k]) { st.est[k] = []; st.trueChips[k] = []; }
    st.trueChips[k][e] = built.trueChips;
    if (e === 0) {
      var a = acquireOne(built, 7100 + e * 97 + k);  /* 冷启动：二维捕获 + 精修，计入 TTFF */
      st.est[k][0] = a.chipsMeas; st.ttff += a.ms;
      st.prevSig[k] = built; st.prevChips[k] = a.chips; st.prevDop[k] = a.dopplerHz;
      st.items[k] = { prn: prn, ms: a.ms, chips: a.chipsMeas, trueChips: built.trueChips,
        chipsErrM: wrapChip(a.chipsMeas - built.trueChips) * chipM(), dopErr: a.dopErr, peakSigma: a.peakSigma, detected: a.detected };
    } else if (st.mode === 'dll' && G.trackDll && st.prevSig[k]) {
      var tr = trackOne(st.prevSig[k], built, st.prevChips[k], st.prevDop[k], 7300 + e * 97 + k);   /* 跟踪态：只做窄相关 */
      st.est[k][e] = tr.chipsMeas;      /* 定位用测量值 */
      st.trackMs += tr.ms; st.trackN++;
      if (!tr.locked) st.unlocked++;
      st.prevSig[k] = built; st.prevChips[k] = tr.chips;   /* 锚点用干净值 */
    } else {
      var a2 = acquireOne(built, 7500 + e * 97 + k);                    /* 对照模式：每历元重新捕获 */
      st.est[k][e] = a2.chipsMeas; st.ttff += a2.ms;
    }
    /* 为载波环生成本历元内的 FINE_M 个连续 4 ms 细块（相位连续、码相位用本历元估计值）。
       A/B 实测（2026-10-07）：把这段按 5 块分片让出主线程，总时长 4.53 s → 5.61 s（+24%），
       而最长 longtask 几乎不变（1003 → 987 ms，大头在 finish() 的载波环后处理），**不划算，已回退**。 */
    if (typeof G.pllTrack === 'function' && G.makeSignal) {
      var fineArr = [], j, ph0;
      var prnFine = (APP.codePrnOf ? APP.codePrnOf(satE.prn) : 1);
      /* 相位基准：本振 f0 是"标称载波"，所以细块的初相取**残余相位**
         θ_res = θ_true − 2π·f0·t（θ_true = st.carr[k] + 2π·dop·j·Δt）。
         这样环路状态 φ 只需跟踪 f_true − f0 的残差（≤50 Hz → 每块 ≤1.26 rad）；
         若按绝对相位喂，φ 要吸收整块的 2π·f·T（≈53 rad），积分器要爬上千块才够（实测牵入 5/6 的根因）。 */
      var f0k = isFinite(st.prevDop[k]) ? st.prevDop[k] : 0;
      for (j = 0; j < FINE_M; j++) {
        ph0 = st.carr[k] + 2 * Math.PI * built.dop * (j * FINE_DT)
              - 2 * Math.PI * f0k * (e * st.stepS + j * FINE_DT);
        fineArr.push({ t: FINE_DT, codeChips: st.est[k][e],
          sig: G.makeSignal({ prn: prnFine, codePhase: built.trueChips, dopplerHz: built.dop,
            carrierPhaseRad: ph0, snrDb: -20, ms: 4, seed: 5000 + k * 1000 + e * 40 + j, fs: 4092000 }) });
      }
      st.fine[k][e] = fineArr;
      /* 细块用的是**本历元起点**相位（上面的 st.carr[k] 还没累加），此刻再把相位推进到下一历元起点；
         并记录本历元**结束**时刻的真相位，供与环路输出对齐比较。 */
      st.carr[k] += 2 * Math.PI * built.dop * st.stepS;
      st.truePhase[k][e] = st.carr[k];                                          /* 绝对真值（参考） */
      st.truePhaseRes[k][e] = st.carr[k] - 2 * Math.PI * (isFinite(st.prevDop[k]) ? st.prevDop[k] : 0) * ((e + 1) * st.stepS);
    }
    st.progress = (e + (k + 1) / info.sats0.length) / st.epochs;
    render();
    setTimeout(function () { step(e, k + 1); }, 0);
  }
  function averageChips(series, N) {
    var base = series[0], s = 0;
    for (var e = 0; e < N; e++) s += wrapChip(series[e] - base);
    return ((base + s / N) % G.CONST.CA_LEN + G.CONST.CA_LEN) % G.CONST.CA_LEN;
  }
  function finish(info) {
    var approx = { x: info.rec.x + APPROX.dx, y: info.rec.y + APPROX.dy, z: info.rec.z + APPROX.dz };
    st.errCurve = []; st.chipCurve = [];
    var last = null, k, q;
    var perEpochItems = [];
    var dll = st.mode === 'dll';
    /* 每个历元都用"当时的卫星位置 + 当时的码相位估计"解一次，两种模式的差别只在码相位怎么来：
       dll 模式 = 捕获一次后由环路逐历元更新；avg 模式 = 每历元独立捕获再对 1..N 累加平均 */
    for (var N = 1; N <= st.epochs; N++) {
      var e = N - 1;
      var chipsOf = dll
        ? (function (ee) { return function (i) { return st.est[i][ee]; }; })(e)
        : (function (nn) { return function (i) { return averageChips(st.est[i], nn); }; })(N);
      var items = [];
      for (k = 0; k < info.sats0.length; k++) {
        items.push({ sat: satAtEpoch(info.sats0[k].prn, e) || info.sats0[k], chips: chipsOf(k) });
      }
      perEpochItems.push(items);
      var out = APP.coldstartSolve(items, approx, CLOCK_M + 9000);
      var err = out.sol && out.sol.ok ? Math.hypot(out.sol.x - info.rec.x, out.sol.y - info.rec.y, out.sol.z - info.rec.z) : NaN;
      st.errCurve.push({ n: N, err: err });
      var sq = 0;
      for (q = 0; q < info.sats0.length; q++) {
        var dq = wrapChip(chipsOf(q) - st.trueChips[q][e]) * chipM();
        sq += dq * dq;
      }
      st.chipCurve.push({ n: N, rms: Math.sqrt(sq / info.sats0.length) });
      last = out;
    }
    st.sol = last.sol; st.meas = last.meas; st.truth = info.rec;
    st.err = st.errCurve.length ? st.errCurve[st.errCurve.length - 1].err : NaN;
    st.err1 = st.errCurve.length ? st.errCurve[0].err : NaN;
    st.chipsRms = st.chipCurve.length ? st.chipCurve[st.chipCurve.length - 1].rms : NaN;
    st.msPerTrack = st.trackN ? st.trackMs / st.trackN : NaN;
    /* 跟踪态/平均态都能再套一层导航滤波器：把逐历元的伪距喂给 8 维 CV 卡尔曼 */
    st.kfCurve = []; st.kfErr = NaN; st.kfRms = NaN; st.rawRms = NaN;
    var sqr = 0;
    for (q = 0; q < st.errCurve.length; q++) if (isFinite(st.errCurve[q].err)) sqr += st.errCurve[q].err * st.errCurve[q].err;
    st.rawRms = Math.sqrt(sqr / Math.max(1, st.errCurve.length));
    /* 精度阶梯第三级：载波平滑（码环 → Costas 载波环 → Hatch 平滑 → 逐历元定位）
       码环逐历元的码相位喂给载波环当 prompt 锚点，载波环的相位再用来平滑码伪距。 */
    st.hatchCurve = []; st.hatchErr = NaN; st.hatchRms = NaN; st.hatchMs = NaN;
    /* 收尾阶段的分片状态：跨多次 finish() 调用保留（第一次调用时初始化，run() 里清空） */
    if (!st.pllSmooth) { st.pllSmooth = []; st.pllLocked = 0; st.pllPass2 = 0; st.pllStats = []; st.hatchT0 = 0; }
    if (dll && typeof G.pllTrack === 'function' && typeof G.hatchSmooth === 'function' && perEpochItems.length === st.epochs) {
      var tHatch = st.hatchT0 || (st.hatchT0 = performance.now());   /* 分片后要跨调用累计，所以起点存在 st 里 */
      var LAM = G.CONST.c / 1575.42e6, e7, k7;
      var prMAt = [];
      for (e7 = 0; e7 < st.epochs; e7++) prMAt.push(APP.coldstartReconstruct(perEpochItems[e7], approx, CLOCK_M + 9000));
      var smoothAt = st.pllSmooth, lockedAll = st.pllLocked, pllStats = st.pllStats, pass2Count = st.pllPass2;
      /* 分片：一次只算**一颗星**的载波环，然后让出主线程、稍后重新进 finish() 接着算。
         归因实测（ds4.1 代理 Nietzsche，2026-10-07）：收尾块中位 1527 ms，其中 6 次 G.pllTrack 占 99.9%
         （单次 ~180 ms）；按卫星分片后最长块 ≈190 ms，总时长基本不变；数值不变（同一顺序、同一参数）。 */
      if (smoothAt.length < info.sats0.length) {
        k7 = smoothAt.length;
        var pllEps = [], jf;
        for (e7 = 0; e7 < st.epochs; e7++) {
          if (st.fine[k7] && st.fine[k7][e7]) {
            for (jf = 0; jf < FINE_M; jf++) pllEps.push(st.fine[k7][e7][jf]);
          } else {
            pllEps.push({ t: st.stepS > 0 ? st.stepS : 1, sig: st.sigs[k7][e7], codeChips: st.est[k7][e7] });
          }
        }
        var f0 = isFinite(st.prevDop[k7]) ? st.prevDop[k7] : 0;
        /* 鉴相器选择：捕获给出的多普勒实测仍有 ±20–83 Hz 误差（acquire 不做频率插值），
           而 Costas 的 |d|≤0.5 使牵引范围只有 ~8 Hz（4 ms 更新）→ 直接上 Costas 牵不进去。
           所以这里用宽牵引的 atan 鉴相（±50 Hz）先把环路牵入；真实接收机牵入后再切 Costas 抗数据位翻转。 */
        /* 增益调度（真实接收机的做法）：先用**高增益宽牵引**把频差拉进来（atan，α=0.8/β=0.08），
           锁住就直接用（对着 Hatch 只有相位增量有用，高增益的相位抖动折算到米是亚厘米级）；
           没锁才做第二遍——用**中位数**估残余频差（抗半周滑失）当本振初值，再用标准增益跟踪。
           单遍标准增益时实测 6 颗里 1 颗会半周滑失（lockQual 0.85、maxErr 2.8 rad）。 */
        var pass1 = G.pllTrack(pllEps, { fNco0: f0, disc: 'atan', alpha: 0.8, beta: 0.08 });
        var pllOut = pass1, usedPass2 = false;
        if (pass1 && !pass1.locked && pass1.freq && pass1.freq.length > 40) {
          var tail = pass1.freq.slice(pass1.freq.length - 40).filter(function (v) { return isFinite(v); })
            .sort(function (a, b) { return a - b; });
          if (tail.length) {
            /* 注意 pllTrack 的 freq[] 是**混叠后的绝对多普勒** wrap(f_true)（步长 1/FINE_DT = 250 Hz），
               不是"相对 f0 的残余"。所以正确的本振重建是「离 f0 最近的 250 Hz 整数倍 + 混叠量」，
               写成 f0 + freq 是错的（实测 dop=800 时 freq 恒为 +50，与 f0=700/800/900 无关）。 */
            /* 相位基准是残余后，freq[] 就是"相对 f0 的残余频差"（不再混叠）：直接 f0 + median(freq)。
               （绝对基准时才需要 250·round(f0/250)+freq 的混叠重建，见 CONTRACT-v16/v17。） */
            var fNew = f0 + tail[Math.floor(tail.length / 2)];
            var pass2 = G.pllTrack(pllEps, { fNco0: fNew, disc: 'costas', alpha: 0.4, beta: 0.02 });
            if (pass2 && pass2.phase && pass2.phase.length === pass1.phase.length &&
                (pass2.lockQual || 0) >= (pass1.lockQual || 0)) { pllOut = pass2; usedPass2 = true; }
          }
        }
        if (usedPass2) pass2Count++;
        if (pllOut.locked) lockedAll++;
        var nFine = (st.fine[k7] && st.fine[k7][0]) ? FINE_M : 1;
        var hEps = [], maxPhaseErr = 0;
        for (e7 = 0; e7 < st.epochs; e7++) {
          var idxEnd = Math.min(pllOut.phase.length - 1, (e7 + 1) * nFine - 1);
          var tSec = e7 * st.stepS;
          var phiNco = isFinite(pllOut.phase[idxEnd]) ? pllOut.phase[idxEnd] : 0;
          if (st.truePhaseRes[k7]) {
            /* 采用"残余相位"基准后，环路状态 φ 应与 θ_res 对齐（不再加 2π·f0·t） */
            var dphi = Math.atan2(Math.sin(st.truePhaseRes[k7][e7] - phiNco), Math.cos(st.truePhaseRes[k7][e7] - phiNco));
            maxPhaseErr = Math.max(maxPhaseErr, Math.abs(dphi));
          }
          st.lastLockQual = pllOut.lockQual;
          st.maxPhaseErr = Math.max(st.maxPhaseErr || 0, maxPhaseErr);
          /* 载波相位（米）：信号里的相位是 +2π·f·t（多普勒为正表示接近），而伪距随接近而减小，
             所以这里取负号，Hatch 的相位差分才与码伪距同向（写错符号会被残差检出成斜坡）。 */
          hEps.push({ prM: prMAt[e7][k7].prM, phaseM: -LAM * (f0 * tSec + phiNco / (2 * Math.PI)) });
        }
        smoothAt.push(G.hatchSmooth(hEps, { window: 0 }).smoothed);
        pllStats.push({ prn: info.sats0[k7].prn, lockQual: pllOut.lockQual, locked: pllOut.locked,
          maxErr: maxPhaseErr, dopErr: st.items[k7] ? st.items[k7].dopErr : NaN,
          fineBlocks: pllEps.length, lastPhase: pllOut.phase[pllOut.phase.length - 1] });
        st.pllLocked = lockedAll; st.pllPass2 = pass2Count;
        /* 进度条走最后 10%，但**不**改 live region 文本（6 次改动会把读屏器刷屏） */
        st.progress = 0.9 + 0.1 * (k7 + 1) / info.sats0.length;
        updateProgressUI();
        setTimeout(function () { finish(info); }, 0);
        return;
      }
      st.pllLocked = lockedAll;
      st.pllPass2Count = pass2Count;   /* 有多少颗是靠第二遍（Costas）才锁上的——必须显示，因为混叠下 Costas 可能是假锁 */
      st.pllStats = pllStats;   /* 逐星诊断：lockQual、相位误差、捕获频差 */
      st.smoothPrM = smoothAt;      /* 供导航滤波器使用：先平滑、再滤波 */
      var s8 = 0;
      for (e7 = 0; e7 < st.epochs; e7++) {
        var items7 = [];
        for (k7 = 0; k7 < info.sats0.length; k7++) {
          var src = prMAt[e7][k7];
          items7.push({ prn: src.prn, x: src.x, y: src.y, z: src.z, prM: smoothAt[k7][e7] });
        }
        var sol7 = G.solvePosition(items7, { guess: approx });
        var err7 = sol7 && sol7.ok ? Math.hypot(sol7.x - info.rec.x, sol7.y - info.rec.y, sol7.z - info.rec.z) : NaN;
        st.hatchCurve.push({ n: e7 + 1, err: err7 });
        if (isFinite(err7)) s8 += err7 * err7;
      }
      st.hatchErr = st.hatchCurve.length ? st.hatchCurve[st.hatchCurve.length - 1].err : NaN;
      st.hatchRms = Math.sqrt(s8 / Math.max(1, st.epochs));
      st.hatchMs = performance.now() - tHatch;
    }
    if (st.useKF && G.navFilter && perEpochItems.length === st.epochs) {
      var kfEpochs = [], e6, k6;
      for (e6 = 0; e6 < st.epochs; e6++) {
        var recv = APP.coldstartReconstruct(perEpochItems[e6], approx, CLOCK_M + 9000);
        var mm = [];
        for (k6 = 0; k6 < recv.length; k6++) {
          var prUse = (st.smoothPrM && st.smoothPrM[k6] && isFinite(st.smoothPrM[k6][e6])) ? st.smoothPrM[k6][e6] : recv[k6].prM;
          mm.push({ sat: { x: recv[k6].x, y: recv[k6].y, z: recv[k6].z }, prM: prUse });
        }
        kfEpochs.push({ t: st.stepS > 0 ? st.stepS : 1, meas: mm });
      }
      var kfOut = G.navFilter(kfEpochs, {});
      if (kfOut && kfOut.series && kfOut.series.length === st.epochs) {
        var s7 = 0;
        for (e6 = 0; e6 < st.epochs; e6++) {
          var xx = kfOut.series[e6].x;
          var err6 = Math.hypot(xx[0] - info.rec.x, xx[1] - info.rec.y, xx[2] - info.rec.z);
          st.kfCurve.push({ n: e6 + 1, err: err6 });
          s7 += err6 * err6;
        }
        st.kfErr = st.kfCurve[st.kfCurve.length - 1].err;
        st.kfRms = Math.sqrt(s7 / st.epochs);
      }
    }
    st.running = false; st.progress = 1; st.phase = '完成';
    st.detected = 0;
    for (var i = 0; i < st.items.length; i++) if (st.items[i] && st.items[i].detected) st.detected++;
    render();
  }
  /* 进度条 + 状态行：便宜、可在分片里反复调用（画布的 draw() 只在整步结束时跑） */
  function updateProgressUI() {
    var bar = el('gl-cold-prog');
    if (bar) bar.style.width = Math.round(st.progress * 100) + '%';
    var wrap = el('gl-cold-prog-wrap');
    if (wrap) wrap.setAttribute('aria-valuenow', Math.round(st.progress * 100));
    /* 状态行：首次进入冷启动页实测要算数秒（含最长近 1 s 的主线程块），
       原来只有一个 4 px 进度条，用户看不出在算什么（2026-10-07 探针实测）。 */
    var ph = el('gl-cold-phase');
    if (ph) {
      var nS = (st.info && st.info.sats0) ? st.info.sats0.length : st.items.length;
      var txt;
      if (st.running) {
        txt = (st.phase && st.phase.indexOf('正在做') === 0)
          ? st.phase
          /* 25% 一档：live region 只在里程碑上更新，避免读屏器被 10 次变更刷屏 */
          : ('正在计算：' + Math.min(100, Math.round(st.progress * 4) * 25) + '%（' + nS + ' 颗 × ' + st.epochs +
             ' 历元，逐颗串行捕获；可以切到别的标签页）');
      } else if (st.items.length) {
        txt = '上次计算完成：' + st.items.length + ' 颗 × ' + st.epochs + ' 历元 · 累计捕获 ' + st.ttff.toFixed(0) + ' ms' +
              /* 注意：updateStats() 里的 m() 是那个函数的**内部**声明，这里取不到（曾报 "m is not defined"） */
              (isFinite(st.err) ? ' · 定位误差 ' + st.err.toFixed(1) + ' m' : '');
      } else {
        txt = '点「执行冷启动」开始（首次打开会自动算一次，约 4–5 秒；期间可以切到别的标签页）';
      }
      if (ph.textContent !== txt) ph.textContent = txt;   /* 只在文字变化时写，避免 live region 刷屏 */
    }
  }
  function render() {
    var det = 0;
    for (var q = 0; q < st.items.length; q++) if (st.items[q] && st.items[q].detected) det++;
    st.detected = det;
    if (APP.panels.cold && APP.panels.cold.draw) APP.panels.cold.draw();
    updateProgressUI();
    updateStats();
  }
  /* 精准修口径：采样率、平台宽、理论下限、细修耗时（老 refinePhase 不经过 fineSearch 时 fineN=0） */
  function fineCtx() {
    if (!(st.fineN > 0)) {
      return '（' + st.fineSpc + ' 采样/chip：分辨率元 ' + (isFinite(st.finePlateauM) ? st.finePlateauM.toFixed(1) : '73.3') + ' m，平台中心下限 ' +
        (isFinite(st.fineSigmaM) ? st.fineSigmaM.toFixed(1) : '21.1') + ' m）';
    }
    var e0 = st.fineN0 > 0 ? Math.sqrt(st.fineErr0Sum / st.fineN0) : NaN;
    var bwTxt = st.frontBw > 0
      ? ('前端 ' + st.frontBw + ' MHz 带限 → 峰顶是光滑丘（估计器 ' + (st.fineEstimator || 'auto') + '，' + st.fineSmooth + '/' + st.fineN + ' 颗判定为光滑丘）')
      : ('前端理想方波 → 峰顶是平台（估计器 ' + (st.fineEstimator || 'auto') + ' 走平台中心）');
    return '（' + st.fineSpc + ' 采样/chip 两级精修 ' + st.fineN + ' 次，' + bwTxt + '；分辨率元（平台宽）' + st.finePlateauM.toFixed(1) + ' m、' +
      '平台中心下限 ' + st.fineSigmaM.toFixed(1) + ' m；首历元精修 RMS ' + (isFinite(e0) ? e0.toFixed(1) : '—') + ' m（上面的"码相位 RMS"是逐历元链路的，主要由 DLL 跟踪决定）' +
      '，细修总耗时 ' + st.fineMs.toFixed(0) + ' ms' + (st.fineEdge ? '，' + st.fineEdge + ' 颗峰落窗边缘' : '') +
      (st.fineWeak ? '，' + st.fineWeak + ' 颗因幅度门退化到旧精修' : '') + '）';
  }
  function updateStats() {
    var n = st.items.length, dll = st.mode === 'dll';
    var peak = 0, i;
    for (i = 0; i < n; i++) peak += st.items[i].peakSigma;
    function m(v) { return isFinite(v) ? v.toFixed(0) + ' m' : '—'; }
    setText('gl-cold-time', st.ttff > 0 ? st.ttff.toFixed(0) + ' ms' : '—');
    setText('gl-cold-time-ctx', n
      ? (dll
        ? (n + ' 颗首历元捕获＝TTFF · 之后每次跟踪更新 ' + (isFinite(st.msPerTrack) ? st.msPerTrack.toFixed(2) + ' ms' : '—'))
        : (n + ' 颗 × ' + st.epochs + ' 历元各自独立捕获 · 均值 ' + (st.ttff / (n * st.epochs)).toFixed(0) + ' ms/次'))
      : '未开始');
    setText('gl-cold-ok', n ? (st.detected + ' / ' + n) : '—');
    setText('gl-cold-ok-ctx', n
      ? ((dll ? '跟踪态 ' + st.trackN + ' 次更新' + (st.unlocked ? ' · 失锁 ' + st.unlocked + ' 次' : ' · 全程锁定') : '单历元') +
         ' · 平均峰 ' + (peak / n).toFixed(1) + 'σ')
      : '未开始');
    setText('gl-cold-err-label', dll ? '跟踪态定位误差' : '多历元平均定位误差');
    setText('gl-cold-err', isFinite(st.err) ? m(st.err) : '—');
    setText('gl-cold-err-ctx', isFinite(st.err1) && st.epochs > 1
      ? (dll
        ? ('首历元 ' + m(st.err1) + ' → 跟踪 ' + st.epochs + ' 历元 ' + m(st.err))
        : ('单历元 ' + m(st.err1) + ' → ' + st.epochs + ' 历元平均 ' + m(st.err)))
      : '未开始');
    setText('gl-cold-detail', n
      ? (dll
        ? (n + ' 颗：首历元二维捕获共 ' + st.ttff.toFixed(0) + ' ms（＝TTFF，本机 JS 真实计算时间），' + st.detected + '/' + n + ' 检出；' +
           '之后每个历元只做 2 组窄相关交给二阶 DLL（跟踪态），单次 ' + (isFinite(st.msPerTrack) ? st.msPerTrack.toFixed(2) : '—') + ' ms（比重新捕获便宜 ' +
           (isFinite(st.msPerTrack) ? (st.ttff / n / st.msPerTrack).toFixed(0) : '—') + '×）；码相位 RMS ' + m(st.chipsRms) + fineCtx() + '，定位误差 ' + m(st.err) +
           '；电离层处理【' + (st.ionoMode === 'none' ? '不改正' : st.ionoMode === 'model' ? '模型改正（剩 30% 残差）' : 'L1/L2 双频（噪声 ×2.98）') +
           '· 活跃度 ×' + st.ionoAct + '，L1 最大斜距延迟 ' + m(st.ionoMax) + '】' +
           (isFinite(st.hatchRms) ? '；载波平滑（Costas 环 + Hatch）后逐历元 RMS ' + m(st.hatchRms) + '（PLL 锁定 ' + st.pllLocked + '/' + n + '，耗时 ' + (isFinite(st.hatchMs) ? st.hatchMs.toFixed(0) : '—') + ' ms）' : '') +
           (isFinite(st.kfRms) && isFinite(st.hatchRms) ? '；再套 8 维 CV 卡尔曼滤波 → ' + m(st.kfRms) + '。精度阶梯：原始码 ' + m(st.rawRms) + ' → 载波平滑 ' + m(st.hatchRms) + ' → 卡尔曼 ' + m(st.kfRms) : (isFinite(st.kfRms) ? '；再套 8 维 CV 卡尔曼滤波后逐历元 RMS ' + m(st.rawRms) + ' → ' + m(st.kfRms) + '（' + (st.rawRms / st.kfRms).toFixed(2) + '× 改善）' : '')) + '。')
        : (n + ' 颗 × ' + st.epochs + ' 历元各自独立捕获共 ' + st.ttff.toFixed(0) + ' ms，' + st.detected + '/' + n + ' 检出；' +
           '单历元首次定位 ' + m(st.err1) + '，多历元平均后 ' + m(st.err) + '（历元间隔 ' + (st.stepS * 1000).toFixed(0) + ' ms）' + fineCtx() +
           (isFinite(st.kfRms) ? '；再套 8 维 CV 卡尔曼滤波：逐历元 RMS ' + m(st.rawRms) + ' → ' + m(st.kfRms) : '') + '。'))
      : '点「执行冷启动」：逐颗生成中频信号、二维捕获、精修码相位，再重建伪距并定位。');
  }
  APP.panels.cold = {
    state: st,
    run: function () {
      if (st.running) return;
      st.running = true; st.items = []; st.est = []; st.trueChips = []; st.errCurve = []; st.chipCurve = [];
      st.prevSig = []; st.prevChips = []; st.prevDop = []; st.sigs = []; st.carr = []; st.fine = []; st.truePhase = []; st.truePhaseRes = []; st.pllStats = []; st.pllPass2Count = 0;
      st.hatchCurve = []; st.hatchErr = NaN; st.hatchRms = NaN; st.pllLocked = 0; st.ionoMax = 0; st.smoothPrM = null;
      st.pllSmooth = null; st.pllPass2 = 0; st.pllStats = []; st.hatchT0 = 0;   /* 收尾分片的累积状态，见 finish() */
      st.ttff = 0; st.trackMs = 0; st.trackN = 0; st.unlocked = 0; st.msPerTrack = NaN; st.chipsRms = NaN;
      st.fineMs = 0; st.fineN = 0; st.fineEdge = 0; st.finePlateauM = NaN; st.fineSigmaM = NaN;
      st.fineWeak = 0; st.fineErr0Sum = 0; st.fineN0 = 0; st.fineSmooth = 0; st.fineEstimator = '';
      st.kfCurve = []; st.kfErr = NaN; st.kfRms = NaN; st.rawRms = NaN;
      st.sol = null; st.err = NaN; st.err1 = NaN; st.progress = 0; st.phase = '运行中';
      st.info = setup();
      updateStats();
      setTimeout(function () { step(0, 0); }, 0);
    },
    render: render, updateStats: updateStats, measureOne: measureOne, wrapChip: wrapChip, averageChips: averageChips, refinePhase: refinePhase,
    init: function () {
      var n = el('gl-cold-n'), e = el('gl-cold-epochs');
      if (n) { n.value = st.n; setText('gl-cold-n-val', st.n + ''); n.addEventListener('input', function () { st.n = parseInt(n.value, 10); setText('gl-cold-n-val', st.n + ''); }); }
      if (e) { e.value = st.epochs; setText('gl-cold-epochs-val', st.epochs + ''); e.addEventListener('input', function () { st.epochs = parseInt(e.value, 10); setText('gl-cold-epochs-val', st.epochs + ''); }); }
      var md = el('gl-cold-mode');
      if (md) {
        md.value = st.mode;
        md.addEventListener('change', function () { st.mode = md.value; updateStats(); });
      }
      var sp = el('gl-cold-step');
      if (sp) {
        sp.value = String(st.stepS);
        setText('gl-cold-step-val', (st.stepS * 1000).toFixed(0) + ' ms');
        sp.addEventListener('input', function () {
          st.stepS = parseFloat(sp.value);
          setText('gl-cold-step-val', (st.stepS * 1000).toFixed(0) + ' ms');
        });
      }
      var snrSel = el('gl-cold-snr');
      if (snrSel) {
        snrSel.value = String(st.snrDb);
        snrSel.addEventListener('change', function () { st.snrDb = parseFloat(snrSel.value); updateStats(); APP.panels.cold.run(); });
      }
      var bwSel = el('gl-cold-frontbw');
      if (bwSel) {
        bwSel.value = String(st.frontBw);
        bwSel.addEventListener('change', function () { st.frontBw = parseFloat(bwSel.value); updateStats(); APP.panels.cold.run(); });
      }
      var fineSel = el('gl-cold-fine');
      if (fineSel) {
        fineSel.value = String(st.fineSpc);
        fineSel.addEventListener('change', function () { st.fineSpc = parseFloat(fineSel.value); updateStats(); APP.panels.cold.run(); });
      }
      var ioSel = el('gl-cold-iono'), ioAct = el('gl-cold-iono-act');
      if (ioSel) {
        ioSel.value = st.ionoMode;
        ioSel.addEventListener('change', function () { st.ionoMode = ioSel.value; updateStats(); APP.panels.cold.run(); });
      }
      if (ioAct) {
        ioAct.value = String(st.ionoAct);
        ioAct.addEventListener('change', function () { st.ionoAct = parseFloat(ioAct.value); updateStats(); APP.panels.cold.run(); });
      }
      var kfBox = el('gl-cold-kf');
      if (kfBox) {
        kfBox.checked = st.useKF;
        kfBox.addEventListener('change', function () { st.useKF = kfBox.checked; });
      }
      var b = el('gl-cold-run');
      if (b) b.addEventListener('click', APP.panels.cold.run);
    }
  };
})();
