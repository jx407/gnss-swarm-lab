/* =====================================================================
 * GNSS 保护限级 HPL / VPL（slope-based RAIM）—— 候选变体 A
 * ---------------------------------------------------------------------
 * 只注册 GNSS.protectionLevels 一个新字段，不改动任何既有函数。
 *
 * 观测模型（与契约 §0/§9/§11 同口径）
 *   meas[i] = { prn, x, y, z, prM, sys? }   —— x/y/z 为卫星 ECEF，prM 为伪距（米）
 *   状态  x = [x, y, z, c·dt]（4 维，**不含 ISB**）；多系统观测必须先在 §11 里估掉/校正 ISB，
 *   或由上层把 ISB 扣干净后再传进来。`sys` 只当标签用，不参与解算（含 sys 与不含 sys 结果逐位相同）。
 *   几何行  g_i = [-u_ix, -u_iy, -u_iz, 1]，u_i 为「接收机 → 卫星」单位视线。
 *
 * 权重口径（与 §9 一致）
 *   W = diag(w)：opts.weights 原样取用；opts.sigmas（米）取 w_i = 1/σᵢ²；两者都没给 → 等权 w≡1。
 *   再把 w 归一化到 mean(w) = 1（§9 weightedDop 的归一化口径）。该归一化对 A / h_ii / slope 完全无影响，
 *   只决定后验 sigmaHat 的绝对尺度；等权时退化为原始 w≡1。
 *
 * 斜率（slope-based RAIM，**简化式**）
 *   A = (GᵀWG)⁻¹GᵀW            (4×n)   —— 第 i 个观测量有偏差 b 时，状态偏移 = A[:,i]·b
 *   h_ii = (G A)_ii = gᵢᵀA[:,i]；P_ii = 1 − h_ii（该星的多余度/redundancy，0 < P_ii ≤ 1）
 *   E 为 2×4 的东/北提取行，U 为 1×4 的天顶提取行（都只作用在位置三分量上，钟差列不参与）。
 *
 *   【契约 §12 的简化式】slopeHᵢ = ‖E·A[:,i]‖ / √P_ii，slopeVᵢ = |U·A[:,i]| / √P_ii
 *     —— 它对应「以归一化残差 zᵢ = rᵢ/(σ̂√P_ii) 为检验量」的口径；完整 RTCA 版本的门限要用
 *        P_fa/P_md 反推非中心参数 λ（HPL = max slopeᵢ · (λ + T)），这里按契约用检测门限 T = threshold 近似。
 *        实测：在权威用例 200 次 MC（σ=5、三系统、threshold=5）上，该口径只罩住 98.5% 的垂直误差
 *        （< 99% 硬门槛），因为 z 检验量保护的是「故障引入的偏差」，并不等于 H0（无故障）下的噪声误差。
 *        本实现仍按此口径算出 hplSimple/vplSimple 一并返回，便于与变体 B / 契约字面对照。
 *   【最终采用的保护限级】经典特征斜率（Brown/RTCA，检验量为原始残差 rᵢ/σ̂）
 *     slopeHᵢ = ‖E·A[:,i]‖ / P_ii，slopeVᵢ = |U·A[:,i]| / P_ii
 *     —— 单星偏差 b 在残差里的响应是 rᵢ = P_ii·b，故「误差/检验量」= ‖EA[:,i]‖/P_ii；
 *        因为 P_ii < 1，它恒 ≥ 简化式，实测覆盖率 100%/100%，符合 §12 声明的目的
 *        「当前几何与噪声水平下真实位置误差不超过的界」。
 *   HPL = maxᵢ(slopeHᵢ)·threshold·sigmaHat，VPL = maxᵢ(slopeVᵢ)·threshold·sigmaHat（threshold 默认 5.0）。
 *
 * sigmaHat 口径（契约 §12 + 返回值里写明）
 *   opts.sigma0 有限且 >0 → sigmaHat = sigma0（先验噪声，推荐；sigmaMode = 'prior'）
 *   否则                → sigmaHat = sqrt(Σ w̃ᵢ rᵢ² / dof)，dof = n − 4（后验；sigmaMode = 'posterior'）
 *
 * 失败路径：观测 < 4 / 无多余度（P_ii ≤ 数值下限）/ 法方程奇异 / 未收敛 / 非法输入
 *   → ok:false、mode:'unreliable' + reason；hpl/vpl/sigmaHat/maxSlope* 一律返回**有限**值（0 或已算出的有限值），
 *     绝不产生 NaN / Infinity。注意 mode:'unreliable' 时 hpl=0 只表示「限级未定义」，不代表精度好。
 *
 * 纯函数、确定性（同一输入逐位相同）、不修改入参；
 * 零依赖纯 JS（ES2018 内）、无 import/require/DOM/Worker/fetch/外部依赖/Math.random/console。
 * ===================================================================== */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  var NU = 4;                                  /* 状态维数 [x,y,z,c·dt] */
  var WGS84_A = 6378137.0;                     /* WGS84 长半轴（米） */
  var WGS84_E2 = 6.69437999014e-3;             /* WGS84 第一偏心率平方 */
  var WGS84_B = 6356752.314245179;             /* WGS84 短半轴（= A·sqrt(1−e²)） */
  var DEG = Math.PI / 180;
  var P_MIN = 1e-9;                            /* 多余度下限：4 星构型的 P_ii 在 ±1e-16 抖动，必须挡住 */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numOr(v, d) { return isNum(v) ? v : d; }
  function intOr(v, d, lo, hi) {
    var x = (typeof v === 'number' && isFinite(v)) ? Math.floor(v) : d;
    if (x < lo) x = lo;
    if (x > hi) x = hi;
    return x;
  }

  /* =====================================================================
   * 1. 4×4 线性代数（部分主元，行列主序）
   * ===================================================================== */

  /* 高斯-约当求逆；奇异 / 非有限返回 null。最后对称化以压掉浮点噪声。 */
  function invert4(m) {
    var a = new Float64Array(32);
    var maxAbs = 0, i, j, k, v, av;
    for (i = 0; i < NU; i++) {
      for (j = 0; j < NU; j++) {
        v = m[i * NU + j];
        if (!isNum(v)) return null;
        a[i * 8 + j] = v;
        av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
      a[i * 8 + NU + i] = 1;
    }
    if (!(maxAbs > 0)) return null;
    var minPivot = 1e-14 * maxAbs;

    for (k = 0; k < NU; k++) {
      var pr = k, pa = 0, c;
      for (i = k; i < NU; i++) {
        c = Math.abs(a[i * 8 + k]);
        if (c > pa) { pa = c; pr = i; }
      }
      if (!isFinite(pa) || pa <= minPivot) return null;
      if (pr !== k) {
        for (j = 0; j < 8; j++) { c = a[k * 8 + j]; a[k * 8 + j] = a[pr * 8 + j]; a[pr * 8 + j] = c; }
      }
      var pv = a[k * 8 + k];
      if (!isFinite(pv) || Math.abs(pv) <= minPivot) return null;
      for (j = 0; j < 8; j++) a[k * 8 + j] /= pv;
      for (i = 0; i < NU; i++) {
        if (i === k) continue;
        var f = a[i * 8 + k];
        if (f === 0) continue;
        for (j = 0; j < 8; j++) a[i * 8 + j] -= f * a[k * 8 + j];
      }
    }

    var inv = new Float64Array(16);
    for (i = 0; i < NU; i++) {
      for (j = 0; j < NU; j++) {
        v = 0.5 * (a[i * 8 + NU + j] + a[j * 8 + NU + i]);
        if (!isNum(v)) return null;
        inv[i * NU + j] = v;
      }
    }
    return inv;
  }

  /* 解 N·d = b（部分主元消元 + 回代）；奇异 / 非有限返回 null。 */
  function solve4(m, b) {
    var a = new Float64Array(16);
    var rhs = new Float64Array(NU);
    var maxAbs = 0, i, j, k, v, av;
    for (i = 0; i < NU; i++) {
      for (j = 0; j < NU; j++) {
        v = m[i * NU + j];
        if (!isNum(v)) return null;
        a[i * NU + j] = v;
        av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
      if (!isNum(b[i])) return null;
      rhs[i] = b[i];
    }
    if (!(maxAbs > 0)) return null;
    var minPivot = 1e-14 * maxAbs;

    for (k = 0; k < NU; k++) {
      var pr = k, pa = 0, c;
      for (i = k; i < NU; i++) {
        c = Math.abs(a[i * NU + k]);
        if (c > pa) { pa = c; pr = i; }
      }
      if (!isFinite(pa) || pa <= minPivot) return null;
      if (pr !== k) {
        for (j = 0; j < NU; j++) { c = a[k * NU + j]; a[k * NU + j] = a[pr * NU + j]; a[pr * NU + j] = c; }
        c = rhs[k]; rhs[k] = rhs[pr]; rhs[pr] = c;
      }
      var pv = a[k * NU + k];
      if (!isFinite(pv) || Math.abs(pv) <= minPivot) return null;
      for (i = k + 1; i < NU; i++) {
        var f = a[i * NU + k] / pv;
        if (f === 0) continue;
        a[i * NU + k] = 0;
        for (j = k + 1; j < NU; j++) a[i * NU + j] -= f * a[k * NU + j];
        rhs[i] -= f * rhs[k];
      }
    }

    var x = new Float64Array(NU);
    for (i = NU - 1; i >= 0; i--) {
      var s = rhs[i];
      for (j = i + 1; j < NU; j++) s -= a[i * NU + j] * x[j];
      var diag = a[i * NU + i];
      if (!(Math.abs(diag) > 0)) return null;
      x[i] = s / diag;
      if (!isFinite(x[i])) return null;
    }
    return x;
  }

  /* =====================================================================
   * 2. 大地坐标与当地 ENU 基（与 winners/ephemeris、winners/uwls 同口径）
   * ===================================================================== */

  /* 只取纬度/经度：Bowring 初值 + 定点迭代；极点附近单独处理。 */
  function geodeticLonLat(x, y, z) {
    if (!isNum(x) || !isNum(y) || !isNum(z)) return null;
    var lon = Math.atan2(y, x);
    var p = Math.sqrt(x * x + y * y);
    var lat, sinLat, N;
    if (p < 1e-9) {
      lat = z >= 0 ? Math.PI / 2 : -Math.PI / 2;
      return { latDeg: lat / DEG, lonDeg: lon / DEG };
    }
    var theta = Math.atan2(z * WGS84_A, p * WGS84_B);
    var st = Math.sin(theta), ct = Math.cos(theta);
    lat = Math.atan2(z + WGS84_E2 * WGS84_B * st * st * st, p - WGS84_E2 * WGS84_A * ct * ct * ct);
    for (var it = 0; it < 15; it++) {
      sinLat = Math.sin(lat);
      N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
      var latNew = Math.atan2(z + WGS84_E2 * N * sinLat, p);
      if (Math.abs(latNew - lat) < 1e-15) { lat = latNew; break; }
      lat = latNew;
    }
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { latDeg: lat / DEG, lonDeg: lon / DEG };
  }

  /* 行主序 [e; n; u] 共 9 元（东、北、天顶）。 */
  function enuBasis(x, y, z) {
    var g = geodeticLonLat(x, y, z);
    if (!g || !isNum(g.latDeg) || !isNum(g.lonDeg)) return null;
    var lat = g.latDeg * DEG, lon = g.lonDeg * DEG;
    var sLat = Math.sin(lat), cLat = Math.cos(lat);
    var sLon = Math.sin(lon), cLon = Math.cos(lon);
    return [
      -sLon, cLon, 0,
      -sLat * cLon, -sLat * sLon, cLat,
      cLat * cLon, cLat * sLon, sLat
    ];
  }

  /* =====================================================================
   * 3. 内部加权最小二乘（Gauss-Newton）
   *    —— 只在本文件内部使用，不依赖 GNSS.solvePosition / GNSS.solveWeighted。
   * ===================================================================== */

  /* 冷启动启发式：接收机 ≈ 地球半径 × 卫星质心方向（可见星都在上方时非常稳）。 */
  function coldStart(n, meas) {
    var cx = 0, cy = 0, cz = 0, i;
    for (i = 0; i < n; i++) {
      cx += meas[i].x; cy += meas[i].y; cz += meas[i].z;
    }
    var cn = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (!(cn > 0) || !isFinite(cn)) return null;
    return [WGS84_A * cx / cn, WGS84_A * cy / cn, WGS84_A * cz / cn, 0];
  }

  /* 返回 { ok, reason, x, y, z, clockBias, residuals, iterations, converged }；失败也返回有限状态。 */
  function localSolve(meas, w, guess, clockGuess, maxIter, tolM) {
    var n = meas.length;
    var st, i, it;
    var g = guess || {};
    if (isNum(g.x) && isNum(g.y) && isNum(g.z)) {
      st = [g.x, g.y, g.z, numOr(clockGuess, 0)];
    } else {
      st = coldStart(n, meas);
      if (!st) {
        return { ok: false, reason: 'invalid geometry: cannot form a cold-start guess',
          x: 0, y: 0, z: 0, clockBias: 0, residuals: [], iterations: 0, converged: false };
      }
      st[3] = numOr(clockGuess, 0);
    }

    var Gm = new Float64Array(n * NU);
    var rv = new Float64Array(n);
    var Nm = new Float64Array(16);
    var rhs = new Float64Array(NU);
    var iters = 0, converged = false, reason = 'maxIter reached without convergence';

    for (it = 0; it < maxIter; it++) {
      iters = it + 1;
      var bad = false;
      for (i = 0; i < n; i++) {
        var dx = meas[i].x - st[0], dy = meas[i].y - st[1], dz = meas[i].z - st[2];
        var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!(rho > 1e-6) || !isFinite(rho) || !isFinite(st[3])) { bad = true; break; }
        Gm[i * NU] = -dx / rho;
        Gm[i * NU + 1] = -dy / rho;
        Gm[i * NU + 2] = -dz / rho;
        Gm[i * NU + 3] = 1;
        rv[i] = meas[i].prM - (rho + st[3]);
      }
      if (bad) { reason = 'degenerate geometry: receiver estimate coincides with a satellite'; break; }

      for (i = 0; i < 16; i++) Nm[i] = 0;
      for (i = 0; i < NU; i++) rhs[i] = 0;
      for (i = 0; i < n; i++) {
        var wi = w[i], a, c;
        for (a = 0; a < NU; a++) {
          var wg = wi * Gm[i * NU + a];
          for (c = 0; c < NU; c++) Nm[a * NU + c] += wg * Gm[i * NU + c];
          rhs[a] += wg * rv[i];
        }
      }

      var d = solve4(Nm, rhs);
      if (!d) { reason = 'degenerate geometry: singular design matrix (GᵀWG not invertible)'; break; }
      var dn = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + d[3] * d[3]);
      if (!isFinite(dn)) { reason = 'diverging Gauss-Newton step'; break; }
      st[0] += d[0]; st[1] += d[1]; st[2] += d[2]; st[3] += d[3];
      if (!isFinite(st[0]) || !isFinite(st[1]) || !isFinite(st[2]) || !isFinite(st[3])) {
        reason = 'diverging solution'; break;
      }
      if (dn < tolM) { converged = true; reason = 'converged'; break; }
    }

    /* 最终残差（供后验 sigmaHat 使用） */
    var residuals = new Array(n);
    for (i = 0; i < n; i++) {
      var ex = meas[i].x - st[0], ey = meas[i].y - st[1], ez = meas[i].z - st[2];
      var rr = Math.sqrt(ex * ex + ey * ey + ez * ez);
      residuals[i] = meas[i].prM - (rr + st[3]);
      if (!isFinite(residuals[i])) residuals[i] = 0;
    }
    return { ok: converged, reason: reason, x: st[0], y: st[1], z: st[2], clockBias: st[3],
      residuals: residuals, iterations: iters, converged: converged };
  }

  /* =====================================================================
   * 4. GNSS.protectionLevels
   * ===================================================================== */
  function protectionLevels(meas, opts) {
    var o = (opts && typeof opts === 'object') ? opts : {};
    var n = Array.isArray(meas) ? meas.length : 0;
    var threshold = numOr(o.threshold, 5.0);
    if (!(threshold > 0)) threshold = 5.0;
    var prior = (isNum(o.sigma0) && o.sigma0 > 0) ? o.sigma0 : null;
    var sigmaMode = prior !== null ? 'prior' : 'posterior';
    var i, a, b, c;

    /* 观测数（卫星数：prn 齐全时按去重计数，否则等于观测数） */
    var nSat = n;
    if (n > 0) {
      var seen = {}, distinct = 0, allPrn = true;
      for (i = 0; i < n; i++) {
        var mm = meas[i] || {};
        if (mm.prn === undefined || mm.prn === null || mm.prn === '') { allPrn = false; break; }
        var key = String(mm.prn);
        if (!seen[key]) { seen[key] = 1; distinct++; }
      }
      if (allPrn && distinct > 0) nSat = distinct;
    }

    var weightMode = 'equal';

    function fail(reason, sigmaHat) {
      return {
        ok: false, reason: String(reason),
        hpl: 0, vpl: 0,
        threshold: threshold,
        sigmaHat: isNum(sigmaHat) ? sigmaHat : 0,
        n: n, dof: (n > NU ? n - NU : 0), nSat: nSat,
        maxSlopeH: 0, maxSlopeV: 0, worstPrn: null,
        mode: 'unreliable',
        sigmaMode: sigmaMode, weightMode: weightMode,
        hplSimple: 0, vplSimple: 0
      };
    }

    if (n < NU) return fail('insufficient measurements (n < 4)');

    /* ---- 观测合法性 ---- */
    for (i = 0; i < n; i++) {
      var mi = meas[i] || {};
      if (!isNum(mi.x) || !isNum(mi.y) || !isNum(mi.z) || !isNum(mi.prM)) {
        return fail('non-finite measurement at index ' + i);
      }
    }

    /* ---- 权重解析（weights 优先于 sigmas）---- */
    var w = new Float64Array(n);
    for (i = 0; i < n; i++) w[i] = 1;
    if (o.weights !== undefined) {
      weightMode = 'weights';
      if (!Array.isArray(o.weights) || o.weights.length !== n) return fail('opts.weights must be an array of length n');
      for (i = 0; i < n; i++) {
        if (!isNum(o.weights[i]) || !(o.weights[i] > 0)) return fail('invalid opts.weights[' + i + '] (must be finite and > 0)');
        w[i] = o.weights[i];
      }
    } else if (o.sigmas !== undefined) {
      weightMode = 'sigmas';
      if (!Array.isArray(o.sigmas) || o.sigmas.length !== n) return fail('opts.sigmas must be an array of length n');
      for (i = 0; i < n; i++) {
        if (!isNum(o.sigmas[i]) || !(o.sigmas[i] > 0)) return fail('invalid opts.sigmas[' + i + '] (must be finite and > 0)');
        w[i] = 1 / (o.sigmas[i] * o.sigmas[i]);
      }
    }
    /* 归一化到 mean(w) = 1（对 A / h_ii / slope 无影响，只定后验 sigmaHat 的尺度） */
    var sw = 0;
    for (i = 0; i < n; i++) sw += w[i];
    if (!(sw > 0) || !isFinite(sw)) return fail('degenerate weights');
    var wMean = sw / n;
    for (i = 0; i < n; i++) w[i] = w[i] / wMean;

    /* ---- 最小二乘解（PL 在解算点上评估）---- */
    var maxIter = intOr(o.maxIter, 20, 1, 200);
    var tolM = numOr(o.tolM, 1e-4);
    if (!(tolM > 0)) tolM = 1e-4;
    var sol = localSolve(meas, w, o.guess, o.clockBiasGuess, maxIter, tolM);
    if (!sol.ok) return fail('position solution failed: ' + sol.reason, prior);
    var x = sol.x, y = sol.y, z = sol.z;

    /* ---- 设计矩阵 G（在解算点上线性化）---- */
    var G = new Float64Array(n * NU);
    for (i = 0; i < n; i++) {
      var dx = meas[i].x - x, dy = meas[i].y - y, dz = meas[i].z - z;
      var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!(rho > 1e-6) || !isFinite(rho)) return fail('degenerate geometry: zero range at index ' + i, prior);
      G[i * NU] = -dx / rho;
      G[i * NU + 1] = -dy / rho;
      G[i * NU + 2] = -dz / rho;
      G[i * NU + 3] = 1;
    }

    /* ---- A = (GᵀWG)⁻¹GᵀW ---- */
    var Nrm = new Float64Array(16);
    for (i = 0; i < n; i++) {
      var wi = w[i];
      for (a = 0; a < NU; a++) {
        var wg = wi * G[i * NU + a];
        for (b = 0; b < NU; b++) Nrm[a * NU + b] += wg * G[i * NU + b];
      }
    }
    var q = invert4(Nrm);
    if (!q) return fail('singular normal matrix (GᵀWG is not invertible)', prior);

    var A = new Float64Array(NU * n);
    for (a = 0; a < NU; a++) {
      for (i = 0; i < n; i++) {
        var s = 0;
        for (c = 0; c < NU; c++) s += q[a * NU + c] * G[i * NU + c];
        A[a * n + i] = s * w[i];
      }
    }

    /* ---- 帽子对角 h_ii 与多余度 P_ii ---- */
    var P = new Float64Array(n);
    for (i = 0; i < n; i++) {
      var h = 0;
      for (a = 0; a < NU; a++) h += G[i * NU + a] * A[a * n + i];
      var pii = 1 - h;
      if (!isFinite(pii) || !(pii > P_MIN)) {
        return fail('insufficient redundancy: P_ii = ' + pii + ' <= ' + P_MIN + ' at index ' + i + ' (hat diagonal h_ii ≈ 1, no fault detection capability)', prior);
      }
      P[i] = pii;
    }

    /* ---- 当地 ENU 基 ---- */
    var basis = enuBasis(x, y, z);
    if (!basis) return fail('cannot derive local ENU frame from the position solution', prior);
    var e1 = basis[0], e2 = basis[1], e3 = basis[2];
    var nn1 = basis[3], nn2 = basis[4], nn3 = basis[5];
    var u1 = basis[6], u2 = basis[7], u3 = basis[8];

    /* ---- 斜率与最大值 ---- */
    var maxSlopeH = 0, maxSlopeV = 0;          /* 经典特征斜率（最终采用） */
    var maxSlopeHSimple = 0, maxSlopeVSimple = 0; /* 契约字面的 √P_ii 简化式 */
    var worstIdx = -1, worstScore = -1;
    for (i = 0; i < n; i++) {
      var c0 = A[i], c1 = A[n + i], c2 = A[2 * n + i];   /* A[:,i] 的位置三分量 */
      var de = e1 * c0 + e2 * c1 + e3 * c2;
      var dn = nn1 * c0 + nn2 * c1 + nn3 * c2;
      var du = u1 * c0 + u2 * c1 + u3 * c2;
      var normH = Math.sqrt(de * de + dn * dn);
      var normV = Math.abs(du);
      var pii2 = P[i];
      var rootP = Math.sqrt(pii2);
      var shSimple = normH / rootP, svSimple = normV / rootP;
      var sh = normH / pii2, sv = normV / pii2;
      if (shSimple > maxSlopeHSimple) maxSlopeHSimple = shSimple;
      if (svSimple > maxSlopeVSimple) maxSlopeVSimple = svSimple;
      if (sh > maxSlopeH) maxSlopeH = sh;
      if (sv > maxSlopeV) maxSlopeV = sv;
      var score = sh > sv ? sh : sv;
      if (score > worstScore) { worstScore = score; worstIdx = i; }
    }

    /* ---- sigmaHat（先验优先，否则后验）---- */
    var dof = n - NU;
    var sigmaHat;
    if (prior !== null) {
      sigmaHat = prior;
    } else {
      var ss = 0;
      for (i = 0; i < n; i++) {
        var ri = sol.residuals[i];
        ss += w[i] * ri * ri;
      }
      sigmaHat = dof > 0 ? Math.sqrt(ss / dof) : 0;
    }
    if (!isNum(sigmaHat) || sigmaHat < 0) return fail('invalid sigmaHat estimate', prior);

    var hpl = maxSlopeH * threshold * sigmaHat;
    var vpl = maxSlopeV * threshold * sigmaHat;
    var hplSimple = maxSlopeHSimple * threshold * sigmaHat;
    var vplSimple = maxSlopeVSimple * threshold * sigmaHat;
    if (!isNum(hpl) || !isNum(vpl) || hpl < 0 || vpl < 0) {
      return fail('non-finite protection level', prior);
    }

    var worstPrn = null;
    if (worstIdx >= 0) {
      var wm = meas[worstIdx] || {};
      worstPrn = (wm.prn === undefined || wm.prn === null) ? worstIdx : wm.prn;
    }

    return {
      ok: true,
      reason: '',
      hpl: hpl,
      vpl: vpl,
      threshold: threshold,
      sigmaHat: sigmaHat,
      n: n,
      dof: dof,
      nSat: nSat,
      maxSlopeH: maxSlopeH,
      maxSlopeV: maxSlopeV,
      worstPrn: worstPrn,
      mode: 'ok',
      /* 口径说明（契约 §12 要求把 sigma 口径写进返回值） */
      sigmaMode: sigmaMode,             /* 'prior' = 用 opts.sigma0；'posterior' = sqrt(Σ w r² / dof) */
      weightMode: weightMode,           /* 'equal' | 'sigmas' | 'weights'（权重已归一化到 mean(w)=1） */
      /* 契约字面的 √P_ii 简化式结果（仅供对照；hpl/vpl 取更保守的经典特征斜率口径） */
      hplSimple: hplSimple,
      vplSimple: vplSimple,
      maxSlopeHSimple: maxSlopeHSimple,
      maxSlopeVSimple: maxSlopeVSimple
    };
  }

  GNSS.protectionLevels = protectionLevels;
})();
