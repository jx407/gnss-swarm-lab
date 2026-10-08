/* =====================================================================
 * GNSS.positioning —— 变体 B（独立数值路线，用于与变体 A 交叉验证）
 * ---------------------------------------------------------------------
 * 与 A 的「4×4 伴随矩阵求逆」路线刻意不同，本文件采用：
 *
 * 1) 每轮线性化方程 A·Δ = r 用 **Householder QR**（对 n×4 的 A 做正交三角化，
 *    再对 R 回代）求解最小二乘，不做 (AᵀA)⁻¹ 显式求逆。
 *    理由：QR 的条件数是正规方程法的平方根（数值误差小一档），而且 R 的对角元
 *    天然携带秩/奇异信息 —— 退化几何可以在解出发散之前就被判出来，不必等到
 *    算出 NaN/Infinity 才发现问题。
 * 2) 步长用 **阻尼 + 回溯**（Levenberg–Marquardt 风味）：先解 λ=0 的 Gauss–Newton 步，
 *    若残差平方和未下降就把步长折半；折半过多就抬升 λ，改解 [A; √λ·I] 的 QR 最小二乘。
 *    远初值（100 km）与病态几何下比裸 Newton 稳。
 * 3) GDOP 不复用 (GᵀG)⁻¹：因为 GᵀG = RᵀR，Q = R⁻¹R⁻ᵀ，
 *    故 trace(Q) = ‖R⁻¹‖²_F ⇒ gdop = ‖R⁻¹‖_F，与 CONTRACT §2 的口径一致。
 * 4) 收敛判据：本轮修正量 ‖Δ‖ < tolM 即停；纯函数，无跨调用可变状态。
 *
 * 未知量顺序固定为 [x, y, z, c·dt]（钟差以米计）。零依赖，无 import/require/DOM/console。
 * ===================================================================== */
(function () {
  'use strict';
  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  var NU = 4;              // 未知量个数
  var COND_LIMIT = 1e6;    // ‖R‖ 对角元 max/min 超过阈值 → 判为退化几何

  /* ---------- 工具 ---------- */
  function numOr(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function intOr(v, d, lo, hi) {
    var n = numOr(v, d);
    n = Math.round(n);
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return n;
  }

  /* ---------- PRNG：与 lib/signal.js 的 mulberry32 同算法，库内自带一份 ---------- */
  function mulberry32Local(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    return typeof GNSS.mulberry32 === 'function' ? GNSS.mulberry32(seed) : mulberry32Local(seed);
  }
  /* Box–Muller：两个均匀数换一个标准正态（每颗卫星独立一次） */
  function gaussian(rnd) {
    var u1 = rnd();
    if (!(u1 > 0)) u1 = Number.MIN_VALUE;   // log(0) 保护
    var u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /* =====================================================================
   * 1. 伪距仿真：prM = |sat - truth| + clockBiasM + σ·N(0,1)
   * ===================================================================== */
  function simulatePseudoranges(sats, truthEcef, opts) {
    if (!Array.isArray(sats) || !truthEcef) return null;
    var o = opts || {};
    var clockBiasM = numOr(o.clockBiasM, 0);
    var sigma = numOr(o.noiseSigmaM, 0);
    if (!(sigma >= 0)) sigma = 0;
    var rnd = makeRng(numOr(o.seed, 1));

    var out = new Array(sats.length);
    for (var i = 0; i < sats.length; i++) {
      var s = sats[i] || {};
      var dx = s.x - truthEcef.x, dy = s.y - truthEcef.y, dz = s.z - truthEcef.z;
      var rangeM = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var noiseM = sigma > 0 ? sigma * gaussian(rnd) : 0;
      out[i] = {
        prn: s.prn, x: s.x, y: s.y, z: s.z,
        prM: rangeM + clockBiasM + noiseM,
        rangeM: rangeM
      };
    }
    return out;
  }

  /* =====================================================================
   * 2. Householder QR 最小二乘求解 min‖A·Δ − rhs‖₂（A 为 m×4 行主序）
   *    调用方传入可写缓冲；返回 {delta, rDiag}；精确奇异（对角元为 0）返回 null。
   *    R 的上三角部分留在 A[0..3][0..3] 中，rDiag 存 R 的对角元。
   * ===================================================================== */
  function qrSolve(A, m, rhs, vbuf) {
    var rDiag = new Float64Array(NU);
    var k, i, j;

    for (k = 0; k < NU; k++) {
      // 取当前列 k 从对角起以下的范数
      var nrm2 = 0;
      for (i = k; i < m; i++) { var av = A[i * NU + k]; nrm2 += av * av; }
      var nrm = Math.sqrt(nrm2);
      if (nrm === 0) { rDiag[k] = 0; continue; }

      var a0 = A[k * NU + k];
      var alpha = a0 >= 0 ? -nrm : nrm;      // 取反号，避免灾难性相消
      var vv = 0;
      for (i = k; i < m; i++) {
        var vi = A[i * NU + k];
        if (i === k) vi -= alpha;
        vbuf[i] = vi;
        vv += vi * vi;
      }
      if (vv > 0) {
        var beta = 2 / vv;                   // H = I − β·v·vᵀ
        for (j = k; j < NU; j++) {
          var s = 0;
          for (i = k; i < m; i++) s += vbuf[i] * A[i * NU + j];
          s *= beta;
          for (i = k; i < m; i++) A[i * NU + j] -= s * vbuf[i];
        }
        var sr = 0;
        for (i = k; i < m; i++) sr += vbuf[i] * rhs[i];
        sr *= beta;
        for (i = k; i < m; i++) rhs[i] -= sr * vbuf[i];
      }
      rDiag[k] = alpha;
      for (i = k + 1; i < m; i++) A[i * NU + k] = 0;
    }

    var delta = new Float64Array(NU);
    for (k = NU - 1; k >= 0; k--) {            // 上三角回代
      if (!(Math.abs(rDiag[k]) > 0) || !isFinite(rDiag[k])) return null;
      var acc = rhs[k];
      for (j = k + 1; j < NU; j++) acc -= A[k * NU + j] * delta[j];
      delta[k] = acc / rDiag[k];
    }
    return { delta: delta, rDiag: rDiag };
  }

  /* GDOP：Q = (GᵀG)⁻¹ = R⁻¹R⁻ᵀ，trace(Q) = ‖R⁻¹‖²_F —— 只用 QR 因子，不重新求逆。
   * A / rDiag 必须是同一次 qrSolve 之后（且未被后续 qrSolve 覆盖）的状态。 */
  function gdopFromQR(A, rDiag) {
    var inv = new Float64Array(NU * NU);
    var j, i, c;
    for (j = 0; j < NU; j++) {                 // 逐列解 R·v = e_j
      for (i = j; i >= 0; i--) {
        if (!(Math.abs(rDiag[i]) > 0)) return null;
        var s = (i === j) ? 1 : 0;
        for (c = i + 1; c <= j; c++) s -= A[i * NU + c] * inv[c * NU + j];
        inv[i * NU + j] = s / rDiag[i];
      }
    }
    var f2 = 0;
    for (i = 0; i < NU; i++) for (j = 0; j < NU; j++) f2 += inv[i * NU + j] * inv[i * NU + j];
    return Math.sqrt(f2);
  }

  /* =====================================================================
   * 3. 定位解算
   * ===================================================================== */
  function solvePosition(meas, opts) {
    var o = opts || {};
    var guess = o.guess || {};

    var state = [
      numOr(guess.x, 0), numOr(guess.y, 0), numOr(guess.z, 0),
      numOr(o.clockBiasGuess, 0)
    ];
    var maxIter = intOr(o.maxIter, 20, 1, 200);
    var tolM = numOr(o.tolM, 1e-4);
    if (!(tolM > 0)) tolM = 1e-4;

    var n = Array.isArray(meas) ? meas.length : 0;
    var reason = '';
    var result = function (ok, iters, residuals, rms, gdop, converged, why) {
      return {
        ok: ok,
        x: state[0], y: state[1], z: state[2], clockBias: state[3],
        iterations: iters, residuals: residuals, rms: rms,
        gdop: gdop, converged: converged, reason: why
      };
    };

    if (n < NU) return result(false, 0, [], 0, null, false, 'insufficient measurements (n<4)');

    // 复制测量值，并做有限性检查（非法输入用 ok:false 表达，不抛异常）
    var px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n), pr = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var mm = meas[i] || {};
      px[i] = mm.x; py[i] = mm.y; pz[i] = mm.z; pr[i] = mm.prM;
      if (!isFinite(px[i]) || !isFinite(py[i]) || !isFinite(pz[i]) || !isFinite(pr[i])) {
        return result(false, 0, [], 0, null, false, 'non-finite measurement data');
      }
    }

    // 工作缓冲
    var G = new Float64Array(n * NU);          // 设计矩阵（行 = [-ux,-uy,-uz,1]）
    var rvec = new Float64Array(n);            // 残差 = 观测 − 估计
    var A = new Float64Array((n + NU) * NU);   // QR 工作矩阵（含阻尼行）
    var rhs = new Float64Array(n + NU);
    var vbuf = new Float64Array(n + NU);

    // 填 G / rvec，返回残差平方和与 trace(GᵀG)（用于自适应阻尼尺度）
    function buildGeom(st) {
      var x = st[0], y = st[1], z = st[2], b = st[3];
      var cost = 0, trace = 0, zeroRange = false;
      for (var i2 = 0; i2 < n; i2++) {
        var dx = px[i2] - x, dy = py[i2] - y, dz = pz[i2] - z;
        var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var ux = 0, uy = 0, uz = 0;
        if (rho > 0) { ux = dx / rho; uy = dy / rho; uz = dz / rho; } else { zeroRange = true; }
        G[i2 * NU] = -ux; G[i2 * NU + 1] = -uy; G[i2 * NU + 2] = -uz; G[i2 * NU + 3] = 1;
        var res = pr[i2] - (rho + b);
        rvec[i2] = res;
        cost += res * res;
        trace += ux * ux + uy * uy + uz * uz + 1;
      }
      return { cost: cost, trace: trace, zeroRange: zeroRange };
    }
    // 只算代价，不动 G / rvec（回溯试探要反复调用）
    function costOf(st) {
      var x = st[0], y = st[1], z = st[2], b = st[3];
      var cost = 0;
      for (var i2 = 0; i2 < n; i2++) {
        var dx = px[i2] - x, dy = py[i2] - y, dz = pz[i2] - z;
        var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var res = pr[i2] - (rho + b);
        cost += res * res;
      }
      return cost;
    }
    // 组装 [G ; √λ·I]·Δ ≈ [r ; 0] 并做 QR（λ=0 时退化为普通最小二乘）
    function solveStep(lam) {
      var extra = lam > 0 ? NU : 0;
      var m2 = n + extra;
      for (var i2 = 0; i2 < n; i2++) {
        var o2 = i2 * NU;
        A[o2] = G[o2]; A[o2 + 1] = G[o2 + 1]; A[o2 + 2] = G[o2 + 2]; A[o2 + 3] = G[o2 + 3];
        rhs[i2] = rvec[i2];
      }
      if (extra) {
        var sq = Math.sqrt(lam);
        for (var k2 = 0; k2 < NU; k2++) {
          for (var c2 = 0; c2 < NU; c2++) A[(n + k2) * NU + c2] = (k2 === c2) ? sq : 0;
          rhs[n + k2] = 0;
        }
      }
      return qrSolve(A, m2, rhs, vbuf);
    }

    var iterations = 0, converged = false, degenerate = false;
    var gdop = null, trial = new Float64Array(NU);

    for (var it = 0; it < maxIter; it++) {
      iterations = it + 1;
      var geom = buildGeom(state);
      if (geom.zeroRange) { degenerate = true; reason = 'degenerate geometry: guess coincides with a satellite'; break; }

      var q0 = solveStep(0);                   // λ=0 的 Gauss–Newton 步
      if (!q0) { degenerate = true; reason = 'degenerate geometry: singular design matrix'; break; }

      // 由 R 判秩/条件数（退化几何在这里就被拦住，不会算出 NaN 或爆炸解）
      var amin = Infinity, amax = 0;
      for (var k = 0; k < NU; k++) {
        var da = Math.abs(q0.rDiag[k]);
        if (da < amin) amin = da;
        if (da > amax) amax = da;
      }
      var condEst = amin > 0 ? amax / amin : Infinity;
      gdop = gdopFromQR(A, q0.rDiag);          // 此时 A 仍是本次 QR 的 R
      if (!(amin > 0) || !(condEst <= COND_LIMIT) || !(gdop !== null) || !isFinite(gdop)) {
        degenerate = true;
        gdop = null;
        reason = 'degenerate geometry: ill-conditioned design matrix (condEst≈' + condEst.toExponential(2) + ')';
        break;
      }

      var d = q0.delta;
      var dn = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + d[3] * d[3]);
      if (dn < tolM) { converged = true; reason = 'converged'; break; }   // 修正量可忽略 → 收敛

      // 阻尼 + 回溯：先试原始步，代价不降就折半；折半到很小就抬 λ 重解带阻尼最小二乘
      var accepted = false, lam = 0, scale = 1;
      var lam0 = 1e-6 * Math.max(geom.trace / NU, 1e-12);
      for (var attempt = 0; attempt < 24 && !accepted; attempt++) {
        var q = (lam === 0 && scale === 1) ? q0 : solveStep(lam);
        if (!q) { lam = lam === 0 ? lam0 : lam * 10; scale = 1; continue; }
        for (var u = 0; u < NU; u++) trial[u] = state[u] + scale * q.delta[u];
        if (costOf(trial) < geom.cost) {
          state[0] = trial[0]; state[1] = trial[1]; state[2] = trial[2]; state[3] = trial[3];
          accepted = true;
        } else if (scale > 0.02) {
          scale *= 0.5;                        // 回溯：先缩短步长
        } else {
          lam = lam === 0 ? lam0 : lam * 10;   // 再阻尼：λ 抬升，步长重新给满
          scale = 1;
          if (!(lam < 1e12 * Math.max(lam0, 1e-30))) break;
        }
      }
      if (!accepted) { reason = 'line search failed: no cost-decreasing step'; break; }
    }

    // 最终统计（无论成功失败都给出有限值）
    buildGeom(state);
    var residuals = new Array(n);
    var ssum = 0;
    for (var q2 = 0; q2 < n; q2++) { residuals[q2] = rvec[q2]; ssum += rvec[q2] * rvec[q2]; }
    var rms = Math.sqrt(ssum / n);

    if (!reason) reason = converged ? 'converged' : 'maxIter reached without convergence';
    var finiteState = isFinite(state[0]) && isFinite(state[1]) && isFinite(state[2]) && isFinite(state[3]);
    var ok = converged && !degenerate && finiteState && isFinite(rms);
    // 失败（病态几何 / 未收敛）时仍返回有限的当前估计：绝不产生 NaN/Infinity，
    // 失败由 ok:false + reason 表达。
    var gdopOut = degenerate ? null : gdop;
    return result(ok, iterations, residuals, rms, gdopOut, converged, reason);
  }

  GNSS.simulatePseudoranges = simulatePseudoranges;
  GNSS.solvePosition = solvePosition;
})();
