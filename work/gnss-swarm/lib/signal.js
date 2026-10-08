/* GNSS 中频信号发生器（参考实现，Codex 亲手写，供捕获模块测试使用）
 * 模型见 CONTRACT.md §3：i = A·c·cos(2πf t) + n_i, q = A·c·sin(2πf t) + n_q
 * SNR = A²/(2σ²) = 10^(snrDb/10) */
(function () {
  'use strict';
  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  GNSS.CONST = GNSS.CONST || {
    c: 299792458,
    mu: 3.986005e14,
    OMEGA_E: 7.2921151467e-5,
    F_L1: 1575.42e6,
    F_CODE: 1.023e6,
    CA_LEN: 1023,
    LAMBDA_L1: 299792458 / 1575.42e6,
    A_GPS: 26561750,
    INC_DEG: 55
  };

  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussianPair(rnd) {
    var u = 1 - rnd();
    var v = rnd();
    var r = Math.sqrt(-2 * Math.log(u));
    return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
  }

  /* 误差函数（Abramowitz & Stegun 7.1.26，|ε| ≤ 1.5e-7）——只用于带限前端，不影响理想方波路径 */
  function erf(x) {
    var sgn = x < 0 ? -1 : 1;
    var z = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * z);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return sgn * y;
  }
  function gaussCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  /* 带限前端（v21 §22）：把理想 ±1 方波码过一遍 3 dB 带宽 = bwHz 的**高斯低通**，
     ⚠️ 常数勘误（ds4.1 子代理 C 轮指出、我复核推导确认）：高斯脉冲 exp(−t²/2σ²) 的
     幅频响应是 exp(−2π²σ²f²)，−3 dB 点满足 4π²σ²f² = ln2 ⇒ f₃dB = √(ln2)/(2πσ) = **0.13251/σ**。
     所以"σ = 0.3748·R/bw"实际给出 f₃dB = 0.3536·bw（差 2√2 倍）；自洽常数是 **0.13251**。
     我原来那个 2√2 的错让"4 MHz 档"实际只有 1.41 MHz 带宽——已改正，旧数字全部作废重测。
     得到光滑的码波形（真实接收机 IF 滤波器的简化代理）。用高斯的好处是全程闭式：
       σ(chip) = 0.3748 · R_CODE / bwHz          （高斯脉冲的 3 dB 带宽 ↔ 标准差换算）
       Ψ(z)    = 高斯 CDF
       码波形   S(τ) = Σ_k c[n0+k] · [Ψ((u−k)/σ) − Ψ((u−k−1)/σ)]，τ = t·R_CODE + codePhase，n0=floor(τ)，u=τ−n0
     Σ_k[Ψ(u−k)−Ψ(u−k−1)] ≡ 1 ⇒ 码的平坦段仍严格是 ±1（幅度/SNR 语义不变），只在跳变处被抹成光滑斜坡。
     bwHz 缺省/0 ⇒ 走原来的**硬采样方波**分支，逐位不变（既有 20 套判据不动的关键）。 */
  function frontEndInfo(bwHz) {
    var R_CODE = 1023e6 / 1e3;
    if (!(bwHz > 0)) return { sigmaChip: 0, K: 0, bwHz: 0, R_CODE: R_CODE };
    var sigmaChip = 0.13251 * R_CODE / bwHz;      /* f₃dB = √(ln2)/(2πσ) = 0.13251/σ ⇒ σ = 0.13251/f₃dB */
    return { sigmaChip: sigmaChip, K: Math.min(12, Math.ceil(3 * sigmaChip) + 1), bwHz: bwHz, R_CODE: R_CODE };
  }

  function makeSignal(opts) {
    var o = opts || {};
    var prn = o.prn == null ? 1 : o.prn;
    var fs = o.fs == null ? 4092000 : o.fs;
    var ms = o.ms == null ? 4 : o.ms;
    var codePhase = o.codePhase == null ? 0 : o.codePhase;
    var carrierPhase = o.carrierPhaseRad == null ? 0 : o.carrierPhaseRad;   /* 载波初相（弧度），默认 0 → 与旧版逐位一致 */
    var dopplerHz = o.dopplerHz == null ? 0 : o.dopplerHz;
    var snrDb = o.snrDb == null ? -20 : o.snrDb;
    var seed = o.seed == null ? 1 : o.seed;
    var amp = o.amp == null ? 1 : o.amp;
    var bwHz = o.bwHz == null ? 0 : o.bwHz;          /* 0 = 理想方波（旧行为） */
    var fe = frontEndInfo(bwHz);
    var sigmaChip = fe.sigmaChip, KFE = fe.K, R_CODE = fe.R_CODE;

    var code = GNSS.caCode(prn);
    if (!code) throw new Error('caCode not available for prn ' + prn);

    var n = Math.round(fs * ms / 1000);
    var sigma = amp / Math.sqrt(2 * Math.pow(10, snrDb / 10));
    var iArr = new Float32Array(n);
    var qArr = new Float32Array(n);
    var rnd = mulberry32(seed);
    var twoPiFd = 2 * Math.PI * dopplerHz;

    // 高斯噪声成对生成，保证给定种子完全确定
    var cache = null;
    for (var j = 0; j < n; j++) {
      var t = j / fs;
      var tau = t * R_CODE + codePhase;              /* 单位 chip；理想方波路径下 t*1023e3 + codePhase 与原式完全一致 */
      var chip, c, k;
      if (sigmaChip > 0) {
        var n0 = Math.floor(tau), u = tau - n0;
        var acc = 0;
        for (k = -KFE; k <= KFE; k++) {
          var lo = gaussCdf((u - k) / sigmaChip), hi = gaussCdf((u - k - 1) / sigmaChip);
          var cm = n0 + k; cm = ((cm % 1023) + 1023) % 1023;
          acc += code[cm] * (lo - hi);
        }
        c = acc;
      } else {
        chip = ((Math.floor(tau) % 1023) + 1023) % 1023;
        c = code[chip];
      }
      var ph = twoPiFd * t + carrierPhase;
      if (!cache) cache = gaussianPair(rnd);
      var ni = cache[0] * sigma, nq = cache[1] * sigma;
      cache = null;
      iArr[j] = amp * c * Math.cos(ph) + ni;
      qArr[j] = amp * c * Math.sin(ph) + nq;
    }
    return {
      i: iArr, q: qArr, fs: fs, ms: ms, n: n,
      bwHz: bwHz, sigmaChip: sigmaChip, frontEndK: KFE,
      prn: prn, codePhase: codePhase, dopplerHz: dopplerHz, snrDb: snrDb, carrierPhaseRad: carrierPhase,
      amp: amp, noiseSigma: sigma, seed: seed,
      trueCodePhaseSamples: codePhase * fs / 1023e3
    };
  }

  /* 非相干包络（供调试/参考对比）：给定码相位与多普勒，返回单点相关幅度 */
  function correlateAt(signal, codePhaseSamples, dopplerHz, ms) {
    var n = Math.min(signal.n, Math.round((ms == null ? signal.ms : ms) * signal.fs / 1000));
    var code = GNSS.caCode(signal.prn);
    var fs = signal.fs;
    var sI = 0, sQ = 0;
    for (var j = 0; j < n; j++) {
      var t = j / fs;
      var tt = ((j - codePhaseSamples) % n + n) % n;
      var chip = ((Math.floor(tt / fs * 1023e3) % 1023) + 1023) % 1023;
      var c = code[chip];
      var ph = 2 * Math.PI * dopplerHz * t;
      var I = signal.i[j] * Math.cos(ph) + signal.q[j] * Math.sin(ph);
      var Q = -signal.i[j] * Math.sin(ph) + signal.q[j] * Math.cos(ph);
      sI += I * c; sQ += Q * c;
    }
    return Math.sqrt(sI * sI + sQ * sQ);
  }

  /* 码相位约定（重要，本项目踩过坑，务必看清方向）：
   * - makeSignal({codePhase:g}) 与 acquire() 输出的 codePhaseSamples：g 是"码相位(chip)"，
   *   采样表示 = g·fs/1.023e6，正方向 = 码超前；两者同一约定，可直接互转。
   * - correlateAt(sig, s)：s 是"复制码延迟(采样)"，与上面**方向相反**（镜像）：
   *   要让相关峰落在 s，必须 s = (N − g·SPC) mod N，其中 SPC = fs/1.023e6、N = 1023·SPC。
   * 下面两个函数封装这层镜像，避免再写错（见 tests/test-signal-conv.js）。 */
  function chipsToCorrelateOffset(chips, fs) {
    var spc = fs / 1023e3, N = 1023 * spc;
    var s = N - (((chips % 1023) + 1023) % 1023) * spc;
    return ((s % N) + N) % N;
  }
  function correlateOffsetToChips(s, fs) {
    var spc = fs / 1023e3, N = 1023 * spc;
    var ch = ((N - (((s % N) + N) % N)) / spc) % 1023;
    return ((ch % 1023) + 1023) % 1023;
  }

  /* 相位感知的 prompt 相关：按本振频率 fNco(Hz) 与相位 φNco(弧度) 同时剥离载波与码，
     返回 { I, Q, amp }。载波环（PLL/Costas）用它做鉴相；correlateAt 只剥频率、不给 I/Q。 */
  function correlateIQ(signal, codePhaseSamples, fNcoHz, phiNcoRad, ms) {
    var n = Math.min(signal.n, Math.round((ms == null ? signal.ms : ms) * signal.fs / 1000));
    var code = GNSS.caCode(signal.prn), fs = signal.fs;
    var sI = 0, sQ = 0, j;
    for (j = 0; j < n; j++) {
      var t = j / fs;
      var tt = ((j - codePhaseSamples) % n + n) % n;
      var chip = ((Math.floor(tt / fs * 1023e3) % 1023) + 1023) % 1023;
      var c = code[chip];
      var ph = 2 * Math.PI * fNcoHz * t + phiNcoRad;
      var cp = Math.cos(ph), sp = Math.sin(ph);
      var I = signal.i[j] * cp + signal.q[j] * sp;
      var Q = -signal.i[j] * sp + signal.q[j] * cp;
      sI += I * c; sQ += Q * c;
    }
    return { I: sI, Q: sQ, amp: Math.sqrt(sI * sI + sQ * sQ) };
  }

  GNSS.mulberry32 = mulberry32;
  GNSS.frontEndInfo = frontEndInfo;
  GNSS.gaussCdf = gaussCdf;
  GNSS.makeSignal = makeSignal;
  GNSS.correlateAt = correlateAt;
  GNSS.correlateIQ = correlateIQ;
  GNSS.chipsToCorrelateOffset = chipsToCorrelateOffset;
  GNSS.correlateOffsetToChips = correlateOffsetToChips;
})();
