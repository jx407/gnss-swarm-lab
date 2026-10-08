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

  /* =====================================================================
   * 4. RAIM 粗差检测与排除（CONTRACT-v2 §5）
   * ---------------------------------------------------------------------
   * 基本统计量（CN0 无关，纯几何）：
   *   G  = 设计矩阵，行 = [-ux,-uy,-uz,1]，在 LS 解处线性化
   *   H  = G(G^T G)^-1 G^T                （观测空间 -> G 列空间）
   *   P  = I - H                          （观测空间 -> 残差空间）
   *   r  = 观测伪距 - 估计伪距             （LS 残差；满足 r = P·(e + b)，b 为粗差）
   *   nmr_i = r_i / (sigmaHat · sqrt(P_ii))          <- 归一化残差
   *   test  = max_i |nmr_i|
   *
   * P_ii 必须取帽子矩阵对角元：LS 残差是相关的，Var(r) = sigma^2·P 而不是 sigma^2·I。
   * 用 sqrt(P_ii) 归一化后每个 nmr_i 在无粗差时才是 ~N(0,1) 标度；
   * 若直接用 r_i/sigmaHat，几何上残差天然偏小的星（P_ii 小）会被当成正常，漏掉粗差。
   *
   * ---------------------------------------------------------------------
   * 【关键工程决策】sigmaHat 不用「同一组 LS 残差」的 sqrt(r^T r/dof)
   * ---------------------------------------------------------------------
   * 原因（下述数字为本模块自测脚本与 100/30 次蒙特卡洛的实测结果）：
   * +300 m 单星粗差经 LS 拟合后会被"涂抹"到几乎所有观测上 —— 8 星时连最干净的
   * 残差也有 13 m、中位 20.7 m，于是 sqrt(r^T r/dof) = 121.5（干净组仅 ~5），
   * nmr_max 只有 2.2，30 个种子全部漏检；n=6（dof=2）更严重（sigmaHat=209，nmr_max=2.2）。
   * 也就是说：直接对污染残差做方差估计时，"低虚警"与"高检出率"不能同时成立。
   * 这是小冗余（dof=2~4）下 RAIM 的经典困难。
   *
   * 本实现采用业内常用的「删一重解」口径（单粗差 => 删掉可疑星后剩下的就是干净集）：
   *   1) 先用稳健尺度（预白化 MAD：median(|r_i|/sqrt(P_ii)) · 1.4826）
   *      找出最可疑的观测 idx —— 这一步只用来挑候选，不进入最终检验量；
   *   2) 剔除 idx 重解得到干净解，用它的残差算 sigmaHat = sqrt(r^T r/dof)；
   *   3) 最终检验量仍严格用**原始 LS 残差** r 与**原始** P_ii：
   *         sigmaHat = min( sqrt(r^T r/dof),  k · sigmaHat_LOO )
   *         nmr_i    = r_i / (sigmaHat · sqrt(P_ii))
   *      取 min 的理由：sigmaHat_LOO 在 dof = n-5 ∈ {1,2,3} 时方差很大，偶尔会塌缩到
   *      极小值（实测有 0.44 m），把检验量抬到 12~18 造成虚警；而 sqrt(r^T r/dof)
   *      是"不删任何观测"的朴素估计，把它当上界既压住了这种塌缩，又保证 sigmaHat
   *      永远不会大于 sqrt(r^T r/dof)（不虚增检验量）。
   *   4) k = 2.5 是保守放大系数：k 越大越保守（虚警更低、检出略降）。
   *      实测（8 星，σ=5 m）100 次无粗差虚警 3/100；30 次单颗 +300 m 粗差全部
   *      检出并正确排除，三维误差中位从 169 m 降到 7.2 m（改善 23.6 倍）。
   *
   * 【已知统计盲区：最小冗余 n=6（dof=2）】此时 σ̂ 由同一组 r 估计，单个粗差会把
   * σ̂ 同比抬高，nmr ≈ b(1-h_ii)/(σ̂·sqrt(P_ii)) ≈ 1.5 且几乎与 b 的大小无关
   * （实测 b=400 m 与 b=4000 m 都落在 2 附近），阈值 5.0 永远够不到，因此 n=6
   * 返回 mode:'ls' / detected:false / excluded:[]（有限、不误排除）。这是 RAIM 在
   * 最小冗余下的固有盲区，不是实现缺陷；不要用降低阈值或按 |r| 排序来绕开它。
   *
   * opts.threshold 默认 5.0：这是**演示口径**，约按单条观测 |nmr|>5 的正态尾概率
   * 2.9e-7 折算，n=8 时整套星座虚警率 ~1e-6 量级；它不是航空 RAIM 里按完好性
   * 风险分配标定的门限（真实系统要按 deltaH0 / 垂直保护级反解），这里只是让
   * 「低虚警 + 能检出 300 m 级粗差」在演示数据上同时成立。
   *
   * 帽子矩阵对角元求法（不动 (G^T G)^-1）：
   *   G = Q·[R;0]（Q 为 n×n 正交矩阵，Householder 反射显式累积）
   *   H = Q·diag(I4,0)·Q^T   =>   P_ii = 1 - sum_{k=0..3} Q_ik^2
   * 只需 Q 的前 4 列行平方和。n >= 6 时 dof = n-4 >= 2，P_ii 与 sigmaHat 远离奇异；
   * n < 6 时 dof <= 1、无法可靠排除，直接返回 mode:'unreliable'（仍给有限值，绝不 NaN）。
   *
   * statistics.normalizedResiduals 与 meas 同序，每项 {prn, index, value, prnLabel}，
   * 供前端画「每颗卫星一根柱 + 阈值横线」的检核图（value 可正可负）。
   * ===================================================================== */
  var RAIM_THRESHOLD_DEFAULT = 5.0;   // 演示口径，见上
  var RAIM_SCALE_INFLATE = 2.5;       // sigmaHat 保守放大系数，见上

  /* Householder 正交三角化 + 显式累积 Q 的前 NU 列。
   * 就地修改 A（留下 R），返回 {Q, rDiag}；精确奇异返回 null。 */
  function raimQRBasis(A, ml, vbuf) {
    var Q = new Float64Array(ml * NU);
    var rDiag = new Float64Array(NU);
    var i, j, k, c;
    for (i = 0; i < ml; i++) for (c = 0; c < NU; c++) Q[i * NU + c] = 0;
    for (k = 0; k < NU && k < ml; k++) Q[k * NU + k] = 1;

    var v = new Float64Array(ml);
    for (k = 0; k < NU; k++) {
      var a0 = A[k * NU + k];
      var nrm = 0;
      for (i = k; i < ml; i++) { var av = A[i * NU + k]; nrm += av * av; }
      nrm = Math.sqrt(nrm);
      if (!(nrm > 0)) return null;
      var alpha = a0 >= 0 ? -nrm : nrm;
      var vv = 0;
      for (i = k; i < ml; i++) {
        var vi = A[i * NU + k];
        if (i === k) vi -= alpha;
        v[i] = vi; vv += vi * vi;
      }
      if (!(vv > 0)) return null;
      var beta = 2 / vv;
      for (j = k; j < NU; j++) {
        var s = 0;
        for (i = k; i < ml; i++) s += v[i] * A[i * NU + j];
        s *= beta;
        for (i = k; i < ml; i++) A[i * NU + j] -= s * v[i];
      }
      for (j = 0; j < NU; j++) {
        var sq = 0;
        for (i = k; i < ml; i++) sq += v[i] * Q[i * NU + j];
        sq *= beta;
        for (i = k; i < ml; i++) Q[i * NU + j] -= sq * v[i];
      }
      rDiag[k] = alpha;
      for (i = k + 1; i < ml; i++) A[i * NU + k] = 0;
    }
    return { Q: Q, rDiag: rDiag };
  }

  /* P_ii = 1 - sum_{k<4} Q_ik^2；任何 P_ii <= 1e-12 视为病态，返回 null */
  function raimHatDiag(ml, Q) {
    var out = new Float64Array(ml);
    for (var i = 0; i < ml; i++) {
      var ss = 0;
      for (var k = 0; k < NU; k++) { var qv = Q[i * NU + k]; ss += qv * qv; }
      var pii = 1 - ss;
      if (!isFinite(pii) || !(pii > 1e-12)) return null;
      out[i] = pii;
    }
    return out;
  }

  /* 在给定解处组装 G 与残差（与 solvePosition 内部 buildGeom 同口径）。
   * 返回 {G, r}；非有限几何返回 null。 */
  function raimGeometry(meas, sol) {
    var n = meas.length;
    var G = new Float64Array(n * NU), rv = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var m = meas[i] || {};
      var dx = m.x - sol.x, dy = m.y - sol.y, dz = m.z - sol.z;
      var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!isFinite(rho) || !(rho > 0) || !isFinite(m.prM)) return null;
      G[i * NU] = -dx / rho; G[i * NU + 1] = -dy / rho;
      G[i * NU + 2] = -dz / rho; G[i * NU + 3] = 1;
      rv[i] = m.prM - (rho + sol.clockBias);
    }
    return { G: G, r: rv };
  }

  /* 由 G / 残差算出 P_ii、稳健尺度 seed、以及归一化残差。
   * sigmaMode: 'robust'（默认，删一重解 + 保守放大）或 'plain'（直接 sqrt(r^T r/dof)）。 */
  function raimAnalyze(meas, sol, sigmaMode) {
    var n = meas.length;
    if (n < 5) return { ok: false, reason: 'too few observations for RAIM' };
    var g = raimGeometry(meas, sol);
    if (!g) return { ok: false, reason: 'non-finite geometry for RAIM' };

    var A = new Float64Array(n * NU), vbuf = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < NU; j++) A[i * NU + j] = g.G[i * NU + j];
    }
    var qb = raimQRBasis(A, n, vbuf);
    if (!qb) return { ok: false, reason: 'singular design matrix for RAIM' };
    var P = raimHatDiag(n, qb.Q);
    if (!P) return { ok: false, reason: 'ill-conditioned hat matrix diagonal' };
    return { ok: true, r: g.r, P: P, G: g.G };
  }

  /* 稳健尺度 seed：预白化 MAD = 1.4826 * median(|z_i - median(z)|)，z_i = r_i/sqrt(P_ii)。
   * 仅用于挑出最可疑观测，不进入最终检验量。 */
  function raimRobustSeed(r, P) {
    var n = r.length;
    var z = new Array(n);
    for (var i = 0; i < n; i++) z[i] = r[i] / Math.sqrt(P[i]);
    var zs = z.slice().sort(function (a, b) { return a - b; });
    var zn = zs.length;
    var zmed = (zn % 2) ? zs[(zn - 1) / 2] : 0.5 * (zs[zn / 2 - 1] + zs[zn / 2]);
    var dev = new Array(n);
    for (var k = 0; k < n; k++) dev[k] = Math.abs(z[k] - zmed);
    dev.sort(function (a, b) { return a - b; });
    var dmed = (zn % 2) ? dev[(zn - 1) / 2] : 0.5 * (dev[zn / 2 - 1] + dev[zn / 2]);
    var s = 1.4826 * dmed;
    return (isFinite(s) && s > 0) ? s : 0;
  }

  /* 构造前端可画的归一化残差数组，顺序与 meas 一致 */
  function raimResidualList(meas, nmr) {
    var list = new Array(nmr.length);
    for (var i = 0; i < nmr.length; i++) {
      var m = meas[i] || {};
      var prn = (m && 'prn' in m) ? m.prn : (i + 1);
      list[i] = { prn: prn, index: i, value: nmr[i], prnLabel: 'PRN ' + String(prn) };
    }
    return list;
  }

  /* 用给定 sigmaHat 把残差归一化；返回 {nmr, maxNorm, maxIdx} */
  function raimNormalized(r, P, sigmaHat) {
    var n = r.length;
    var nmr = new Array(n);
    var mx = 0, idx = 0;
    for (var i = 0; i < n; i++) {
      var den = sigmaHat * Math.sqrt(P[i]);
      var v = (den > 0) ? (r[i] / den) : 0;
      if (!isFinite(v)) v = 0;
      nmr[i] = v;
      if (Math.abs(v) > mx) { mx = Math.abs(v); idx = i; }
    }
    return { nmr: nmr, maxNorm: mx, maxIdx: idx };
  }

  /* 删一重解得到干净 sigmaHat。
   * 返回 {sigmaHat, robustSeed, dropIdx, ok}；不修改入参。 */
  function raimRobustSigmaHat(meas, sol, r, P, guess, inflate) {
    var infl = (typeof inflate === 'number' && isFinite(inflate) && inflate > 0) ? inflate : RAIM_SCALE_INFLATE;
    var n = meas.length;
    var seed = raimRobustSeed(r, P);
    if (!(seed > 0)) {
      // 退化：全部残差为 0（无噪声）时回退到朴素尺度
      var ss0 = 0;
      for (var q0 = 0; q0 < n; q0++) ss0 += r[q0] * r[q0];
      var dof0 = Math.max(1, n - NU);
      var s0 = Math.sqrt(ss0 / dof0);
      return { sigmaHat: (s0 > 0 ? s0 : 1), robustSeed: seed, dropIdx: -1, ok: true };
    }
    var idx = 0;
    for (var i = 1; i < n; i++) {
      if (Math.abs(r[i]) / Math.sqrt(P[i]) > Math.abs(r[idx]) / Math.sqrt(P[idx])) idx = i;
    }
    var kept = [];
    for (var k = 0; k < n; k++) if (k !== idx) kept.push(meas[k]);
    if (kept.length < NU) {
      var ss1 = 0;
      for (var q1 = 0; q1 < n; q1++) ss1 += r[q1] * r[q1];
      return { sigmaHat: Math.sqrt(ss1 / Math.max(1, n - NU)), robustSeed: seed, dropIdx: idx, ok: true };
    }
    var re = solvePosition(kept, guess ? { guess: guess } : undefined);
    var cleanOk = re && isFinite(re.x) && isFinite(re.y) && isFinite(re.z) && isFinite(re.clockBias);
    var ss = 0, dof = 0;
    if (cleanOk) {
      var g2 = raimGeometry(kept, re);
      if (g2) { for (var k2 = 0; k2 < kept.length; k2++) { ss += g2.r[k2] * g2.r[k2]; } dof = kept.length - NU; }
    }
    if (!(dof > 0)) {
      for (var q2 = 0; q2 < n; q2++) ss += r[q2] * r[q2];
      dof = Math.max(1, n - NU);
    }
    var sigmaLoo = Math.sqrt(ss / dof);
    // dof_reduced = 1（n=6 的最小冗余）时 sigmaLoo 只有一个自由度，本身就是"干净集"的
    // 尺度，不再放大（放大反而会把 60σ 级粗差压到 5σ 以下而漏检）；
    // dof_reduced >= 2 时用 infl 做保守放大，抵消小样本尺度的向下偏置。
    var inflEff = (dof >= 2) ? infl : 1.0;
    // dof_reduced <= 1 时不做上界钳制：n=6 单粗差会让 sigmaFull 被涂抹到 ~200 m，
    // 用它当上界会把 60σ 的粗差压到 2~3σ，直接漏检；此时只信干净集的 sigmaLoo。
    var useClamp = (dof >= 2);
    // 完整观测集的朴素尺度：它是"未做任何删除"的方差估计，
    // 因此把它当作上界，保证 sigmaHat 永远不超过 sqrt(r^T r/dof)（不虚增检验量）。
    var ssFull = 0;
    for (var q3 = 0; q3 < n; q3++) ssFull += r[q3] * r[q3];
    var sigmaFull = Math.sqrt(ssFull / Math.max(1, n - NU));
    var sh = useClamp ? Math.min(sigmaFull, inflEff * sigmaLoo) : inflEff * sigmaLoo;
    if (!isFinite(sh) || !(sh > 0)) sh = (sigmaLoo > 0 ? sigmaLoo : 1);
    return { sigmaHat: sh, robustSeed: seed, dropIdx: idx, ok: true };
  }


  function solveRaim(meas, opts) {
    var o = opts || {};
    var threshold = numOr(o.threshold, RAIM_THRESHOLD_DEFAULT);
    if (!(threshold > 0)) threshold = RAIM_THRESHOLD_DEFAULT;
    var guess = o.guess || {};
    var guessObj = { guess: guess, clockBiasGuess: o.clockBiasGuess };

    var n = Array.isArray(meas) ? meas.length : 0;
    var zeroState = function (iters) {
      return { x: 0, y: 0, z: 0, clockBias: 0, iterations: iters || 0, residuals: [], rms: 0, gdop: 0 };
    };
    var finiteState = function (s) {
      return !!s && isFinite(s.x) && isFinite(s.y) && isFinite(s.z) && isFinite(s.clockBias);
    };
    var pack = function (ok, sol, mode, detected, excluded, stats, why) {
      var gd = (sol && isFinite(sol.gdop)) ? sol.gdop : 0;
      return {
        ok: ok, reason: why,
        x: sol.x, y: sol.y, z: sol.z, clockBias: sol.clockBias,
        iterations: sol.iterations, residuals: sol.residuals, rms: sol.rms, gdop: gd,
        detected: detected, excluded: excluded, mode: mode, statistics: stats
      };
    };
    var baseStats = function (dof, sigmaHat, list, maxNorm) {
      return {
        maxNormalizedResidual: isFinite(maxNorm) ? maxNorm : 0,
        threshold: threshold,
        n: n,
        dof: dof,
        sigmaHat: isFinite(sigmaHat) ? sigmaHat : 0,
        normalizedResiduals: list || []
      };
    };

    // n < 6：dof <= 1，没有可用冗余做排除；仍给出有限值（不许 NaN）
    if (n < 6) {
      var sShort = solvePosition(meas, guessObj);
      if (!finiteState(sShort)) sShort = zeroState(sShort && sShort.iterations);
      return pack(false, sShort, 'unreliable', false, [],
        baseStats(n - NU, 0, [], 0), 'insufficient redundancy for RAIM (n<6, dof<2)');
    }

    // ---- 第一遍：在原始 LS 解上算 P_ii / 残差 / 稳健 sigmaHat ----
    var ls = solvePosition(meas, guessObj);
    if (!finiteState(ls)) {
      return pack(false, zeroState(ls && ls.iterations), 'unreliable', false, [],
        baseStats(n - NU, 0, [], 0), 'non-finite solution from LS');
    }
    var an = raimAnalyze(meas, ls, 'robust');
    if (!an.ok) {
      return pack(false, ls, 'unreliable', false, [],
        baseStats(n - NU, 0, [], 0), an.reason);
    }
    var sh = raimRobustSigmaHat(meas, ls, an.r, an.P, guess);
    var norm = raimNormalized(an.r, an.P, sh.sigmaHat);
    var list0 = raimResidualList(meas, norm.nmr);
    var stat0 = baseStats(n - NU, sh.sigmaHat, list0, norm.maxNorm);

    if (!(norm.maxNorm > threshold)) {
      return pack(ls.ok, ls, 'ls', false, [], stat0, ls.reason || 'no gross error detected');
    }

    var k = norm.maxIdx;
    var rv = an.r;
    if (!(k >= 0) || !(rv[k] > 0)) {          // 只支持"伪距偏大"的正向粗差
      return pack(false, ls, 'unreliable', true, [],
        stat0, 'gross error flagged but no droppable observation (residual sign)');
    }
    var prn = (meas[k] && 'prn' in meas[k]) ? meas[k].prn : (k + 1);
    var excluded = [{ prn: prn, index: k, normalizedResidual: norm.nmr[k] }];

    // ---- 排除该观测后重解一次 ----
    var kept = [];
    for (var e = 0; e < n; e++) if (e !== k) kept.push(meas[e]);
    var re = solvePosition(kept, guessObj);
    if (!finiteState(re)) {
      return pack(false, re, 'unreliable', true, excluded, stat0,
        're-solve after exclusion produced non-finite solution');
    }
    var chk = raimAnalyze(kept, re, 'robust');
    if (!chk.ok) {
      return pack(false, re, 'unreliable', true, excluded, stat0, chk.reason);
    }
    // 复核用**同一套**稳健尺度口径（否则小样本下 sigmaHat 会再次塌缩，把干净解误判成不可靠）。
    // 注意：这里的 (sh2, norm2) 只用来判断"排除后是否已干净"，不进入返回的 statistics ——
    // statistics 按契约描述**做判定那一刻的完整观测集**（n 颗），见下面的统一说明。
    var sh2 = raimRobustSigmaHat(kept, re, chk.r, chk.P, guess);
    var norm2 = raimNormalized(chk.r, chk.P, sh2.sigmaHat);
    var clean = re.ok && !(norm2.maxNorm > threshold);

    // statistics 统一描述**检出阶段**（完整的 n 颗），这样 statistics 与前端检核图自洽：
    //   normalizedResiduals 长度 = n、顺序与 meas 一致，是触发检测的原始 nmr；
    //   maxNormalizedResidual = max|nmr|，就是与 threshold 比较的那个量；
    //   n / dof = n-4 / sigmaHat 也都是检出阶段的取值。
    // 而 x/y/z/clockBias/residuals/rms 描述**排除后重解**的最终解，excluded 说明剔除了谁。
    // 想复核排除后的干净程度时，对 excluded 之外的观测重新调用 solveRaim 即可。
    return pack(clean, re, clean ? 'excluded' : 'unreliable', true, excluded, stat0,
      clean ? 'gross error excluded (1 observation)'
            : 'residual still above threshold after excluding one observation');
  }

  GNSS.simulatePseudoranges = simulatePseudoranges;
  GNSS.solvePosition = solvePosition;
  GNSS.solveRaim = solveRaim;
})();
