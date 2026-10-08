/* =====================================================================
 * GNSS 高程加权最小二乘（候选变体 A）
 * ---------------------------------------------------------------------
 * 只注册三个函数，不改动既有 solvePosition / simulatePseudoranges / dop：
 *   GNSS.uereSigma(elevDeg, opts)        -> 仰角相关伪距 1sigma（米）
 *   GNSS.weightedDop(sats, rec, sigmas)  -> 加权 DOP（本地 ENU 的 HDOP/VDOP）
 *   GNSS.solveWeighted(meas, opts)       -> 迭代加权最小二乘
 *
 * 数值路线：
 *   - 4x4 正规方程 N = G'PG：DOP 用带部分主元的 Gauss-Jordan 求逆；
 *     迭代步用带部分主元的高斯消元直接解 N*delta = G'Pr。
 *   - DOP 口径：W = diag(1/sigma_i^2) 归一化到平均权重 1，
 *     N = G'diag(w)G，DOP 取 N^-1 的对角元（等 sigma 时退化为标准几何 DOP）。
 *     位置子块旋转到本地 ENU 得 HDOP/VDOP；TDOP=sqrt(Q_tt)；
 *     GDOP^2 = PDOP^2 + TDOP^2。
 *   - 等权（sigmas 全相同或未给权重）直接复用 GNSS.solvePosition，
 *     保证与既有最小二乘逐位一致；非等权迭代
 *     delta = (G'WG)^-1 G'Wr，并以实际加权代价回溯保证单调下降。
 * ===================================================================== */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  var DEG = Math.PI / 180;

  /* WGS-84（与 winners/ephemeris.js 同值，仅作 ENU 基的回退计算） */
  var WGS84_A = 6378137;
  var WGS84_F = 1 / 298.257223563;
  var WGS84_E2 = WGS84_F * (2 - WGS84_F);
  var WGS84_B = WGS84_A * (1 - WGS84_F);
  var WGS84_EP2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) /
    (WGS84_B * WGS84_B);

  var DEF_ZENITH_M = 0.5;
  var DEF_HORIZON_M = 0.4;
  var DEF_EL_MIN_DEG = 5;
  var DEF_MAX_ITER = 20;
  var DEF_TOL_M = 1e-4;

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }
  function numOr(v, d) {
    return isNum(v) ? v : d;
  }
  function intOr(v, d, lo, hi) {
    var t = numOr(v, d);
    t = Math.round(t);
    if (t < lo) t = lo;
    if (t > hi) t = hi;
    return t;
  }

  /* =====================================================================
   * 1. 仰角相关 UERE：sigma(el)^2 = sigmaZ^2 + (sigmaH/sin el)^2
   * ===================================================================== */
  function uereSigma(elevDeg, opts) {
    var o = opts || {};
    var zen = (o.zenithM === undefined) ? DEF_ZENITH_M : o.zenithM;
    var hor = (o.horizonM === undefined) ? DEF_HORIZON_M : o.horizonM;
    var elMin = (o.elMinDeg === undefined) ? DEF_EL_MIN_DEG : o.elMinDeg;
    if (!isNum(elevDeg) || !isNum(zen) || !isNum(hor) || !isNum(elMin)) return null;
    if (!(zen >= 0) || !(hor >= 0) || !(elMin > 0)) return null;
    if (elevDeg < -90 || elevDeg > 90) return null;
    var el = elevDeg < elMin ? elMin : elevDeg;   // 低于截止仰角按截止值计算
    if (el > 90) el = 90;
    var s = Math.sin(el * DEG);
    if (!(s > 0)) s = Number.MIN_VALUE;           // 极端小角度除零保护
    var hTerm = hor / s;
    var variance = zen * zen + hTerm * hTerm;
    if (!isFinite(variance)) return null;
    return Math.sqrt(variance);
  }

  /* =====================================================================
   * 2. ECEF -> 大地坐标（优先复用 GNSS.geodeticFromEcef，缺失时回退）
   * ===================================================================== */
  function geodeticLocal(x, y, z) {
    if (!isNum(x) || !isNum(y) || !isNum(z)) return null;
    var lon = Math.atan2(y, x);
    var p = Math.sqrt(x * x + y * y);
    var lat, h, sinLat, cosLat, N;

    if (p < 1e-12) {
      lat = z >= 0 ? Math.PI / 2 : -Math.PI / 2;
      h = Math.abs(z) - WGS84_B;
      return { latDeg: lat / DEG, lonDeg: lon / DEG, hM: h };
    }

    /* Bowring 初值 + 定点迭代（与 winners/ephemeris.js 同算法） */
    var theta = Math.atan2(z * WGS84_A, p * WGS84_B);
    var sinTheta = Math.sin(theta);
    var cosTheta = Math.cos(theta);
    lat = Math.atan2(
      z + WGS84_EP2 * WGS84_B * sinTheta * sinTheta * sinTheta,
      p - WGS84_E2 * WGS84_A * cosTheta * cosTheta * cosTheta
    );

    for (var it = 0; it < 15; it++) {
      sinLat = Math.sin(lat);
      cosLat = Math.cos(lat);
      N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
      if (Math.abs(cosLat) >= Math.abs(sinLat)) h = p / cosLat - N;
      else h = z / sinLat - N * (1 - WGS84_E2);
      var latNew = Math.atan2(z + WGS84_E2 * N * sinLat, p);
      if (Math.abs(latNew - lat) < 1e-15) {
        lat = latNew;
        break;
      }
      lat = latNew;
    }

    sinLat = Math.sin(lat);
    cosLat = Math.cos(lat);
    N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    if (Math.abs(cosLat) >= Math.abs(sinLat)) h = p / cosLat - N;
    else h = z / sinLat - N * (1 - WGS84_E2);
    return { latDeg: lat / DEG, lonDeg: lon / DEG, hM: h };
  }

  function enuBasis(x, y, z) {
    var g = null;
    if (typeof GNSS.geodeticFromEcef === 'function') {
      g = GNSS.geodeticFromEcef(x, y, z);
    }
    if (!g || !isNum(g.latDeg) || !isNum(g.lonDeg)) {
      g = geodeticLocal(x, y, z);
    }
    if (!g || !isNum(g.latDeg) || !isNum(g.lonDeg)) return null;
    var lat = g.latDeg * DEG;
    var lon = g.lonDeg * DEG;
    var sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    var sinLon = Math.sin(lon), cosLon = Math.cos(lon);
    /* 行主序存放三个基向量：[e; n; u]，与 ephemeris.dop 的 ENU 口径一致 */
    return [
      -sinLon, cosLon, 0,
      -sinLat * cosLon, -sinLat * sinLon, cosLat,
      cosLat * cosLon, cosLat * sinLon, sinLat
    ];
  }

  /* =====================================================================
   * 3. 4x4 线性代数：带部分主元
   * ===================================================================== */
  /* 求逆（Gauss-Jordan，行主序 16 元）；奇异返回 null。最后对称化。 */
  function invert4(m) {
    var a = new Float64Array(32);
    var maxAbs = 0, i, j, k;
    for (i = 0; i < 4; i++) {
      for (j = 0; j < 4; j++) {
        var v = m[i * 4 + j];
        if (!isFinite(v)) return null;
        a[i * 8 + j] = v;
        var av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
      a[i * 8 + 4 + i] = 1;
    }
    if (maxAbs === 0) return null;
    var minPivot = 1e-12 * maxAbs;

    for (k = 0; k < 4; k++) {
      var pivotRow = k, pivotAbs = 0;
      for (i = k; i < 4; i++) {
        var c = Math.abs(a[i * 8 + k]);
        if (c > pivotAbs) { pivotAbs = c; pivotRow = i; }
      }
      if (!isFinite(pivotAbs) || pivotAbs <= minPivot) return null;
      if (pivotRow !== k) {
        for (j = 0; j < 8; j++) {
          var tmp = a[k * 8 + j];
          a[k * 8 + j] = a[pivotRow * 8 + j];
          a[pivotRow * 8 + j] = tmp;
        }
      }
      var pivot = a[k * 8 + k];
      if (!isFinite(pivot) || Math.abs(pivot) <= minPivot) return null;
      for (j = 0; j < 8; j++) a[k * 8 + j] /= pivot;
      for (i = 0; i < 4; i++) {
        if (i === k) continue;
        var factor = a[i * 8 + k];
        if (factor === 0) continue;
        for (j = 0; j < 8; j++) a[i * 8 + j] -= factor * a[k * 8 + j];
      }
    }

    var inv = new Float64Array(16);
    for (i = 0; i < 4; i++) {
      for (j = 0; j < 4; j++) {
        var val = 0.5 * (a[i * 8 + 4 + j] + a[j * 8 + 4 + i]);
        if (!isFinite(val)) return null;
        inv[i * 4 + j] = val;
      }
    }
    return inv;
  }

  /* 解 N*delta = b（部分主元高斯消元 + 回代）；奇异返回 null。 */
  function solve4(m, b) {
    var a = new Float64Array(16);
    var rhs = new Float64Array(4);
    var maxAbs = 0, i, j, k;
    for (i = 0; i < 4; i++) {
      for (j = 0; j < 4; j++) {
        var v = m[i * 4 + j];
        if (!isFinite(v)) return null;
        a[i * 4 + j] = v;
        var av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
      if (!isFinite(b[i])) return null;
      rhs[i] = b[i];
    }
    if (maxAbs === 0) return null;
    var minPivot = 1e-12 * maxAbs;

    for (k = 0; k < 4; k++) {
      var pr = k, pa = 0;
      for (i = k; i < 4; i++) {
        var c = Math.abs(a[i * 4 + k]);
        if (c > pa) { pa = c; pr = i; }
      }
      if (!isFinite(pa) || pa <= minPivot) return null;
      if (pr !== k) {
        for (j = 0; j < 4; j++) {
          var tmp = a[k * 4 + j];
          a[k * 4 + j] = a[pr * 4 + j];
          a[pr * 4 + j] = tmp;
        }
        var tb = rhs[k];
        rhs[k] = rhs[pr];
        rhs[pr] = tb;
      }
      var pivot = a[k * 4 + k];
      if (!isFinite(pivot) || Math.abs(pivot) <= minPivot) return null;
      for (i = k + 1; i < 4; i++) {
        var f = a[i * 4 + k] / pivot;
        if (f === 0) continue;
        a[i * 4 + k] = 0;
        for (j = k + 1; j < 4; j++) a[i * 4 + j] -= f * a[k * 4 + j];
        rhs[i] -= f * rhs[k];
      }
    }

    var x = new Float64Array(4);
    for (i = 3; i >= 0; i--) {
      var s = rhs[i];
      for (j = i + 1; j < 4; j++) s -= a[i * 4 + j] * x[j];
      var diag = a[i * 4 + i];
      if (!(Math.abs(diag) > 0)) return null;
      x[i] = s / diag;
      if (!isFinite(x[i])) return null;
    }
    return x;
  }

  /* 位置子块的二次型 v'Qv（Q 为 4x4 逆矩阵的位置子块） */
  function quad3(q, ex, ey, ez) {
    return ex * (q[0] * ex + q[1] * ey + q[2] * ez) +
      ey * (q[4] * ex + q[5] * ey + q[6] * ez) +
      ez * (q[8] * ex + q[9] * ey + q[10] * ez);
  }

  /* 由卫星位置列表构造视线行 [-ux,-uy,-uz,1]；失败返回原因字符串，成功 null */
  function fillRows(list, n, rx, ry, rz, rows) {
    for (var i = 0; i < n; i++) {
      var o = list[i] || {};
      if (!isNum(o.x) || !isNum(o.y) || !isNum(o.z)) {
        return 'non-finite satellite position at index ' + i;
      }
      var dx = o.x - rx, dy = o.y - ry, dz = o.z - rz;
      var range = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!isFinite(range) || !(range > 1e-9)) {
        return 'degenerate geometry: zero range at index ' + i;
      }
      rows[i * 4] = -dx / range;
      rows[i * 4 + 1] = -dy / range;
      rows[i * 4 + 2] = -dz / range;
      rows[i * 4 + 3] = 1;
    }
    return null;
  }

  /* p 为相对权；返回加权 DOP（本地 ENU 的 HDOP/VDOP） */
  function dopFromRows(rows, p, n, rec) {
    var N = new Float64Array(16);
    var i, a, b;
    for (i = 0; i < n; i++) {
      var wi = p[i];
      for (a = 0; a < 4; a++) {
        var wa = wi * rows[i * 4 + a];
        for (b = 0; b < 4; b++) N[a * 4 + b] += wa * rows[i * 4 + b];
      }
    }

    var q = invert4(N);
    if (!q) return { ok: false, reason: 'singular weighted normal matrix' };

    var pdop2 = q[0] + q[5] + q[10];
    var tdop2 = q[15];
    var gdop2 = pdop2 + tdop2;
    if (!(pdop2 >= 0) || !(tdop2 >= 0) || !isFinite(gdop2)) {
      return { ok: false, reason: 'invalid weighted normal inverse' };
    }

    var basis = enuBasis(rec.x, rec.y, rec.z);
    if (!basis) return { ok: false, reason: 'cannot derive local ENU frame' };
    var hdop2 = quad3(q, basis[0], basis[1], basis[2]) +
      quad3(q, basis[3], basis[4], basis[5]);
    var vdop2 = quad3(q, basis[6], basis[7], basis[8]);
    var tol = 1e-12 * Math.max(1, pdop2);
    if (hdop2 < -tol || vdop2 < -tol) {
      return { ok: false, reason: 'non-positive ENU variance' };
    }
    if (hdop2 < 0) hdop2 = 0;
    if (vdop2 < 0) vdop2 = 0;

    var pdop = Math.sqrt(pdop2);
    var tdop = Math.sqrt(tdop2);
    var gdop = Math.sqrt(gdop2);
    var hdop = Math.sqrt(hdop2);
    var vdop = Math.sqrt(vdop2);
    if (!isFinite(pdop) || !isFinite(tdop) || !isFinite(gdop) ||
        !isFinite(hdop) || !isFinite(vdop)) {
      return { ok: false, reason: 'non-finite DOP' };
    }
    return { ok: true, gdop: gdop, pdop: pdop, hdop: hdop, vdop: vdop, tdop: tdop };
  }

  function dopAtList(list, n, sx, sy, sz, p) {
    var rows = new Float64Array(n * 4);
    var err = fillRows(list, n, sx, sy, sz, rows);
    if (err) return { ok: false, reason: err };
    return dopFromRows(rows, p, n, { x: sx, y: sy, z: sz });
  }

  /* =====================================================================
   * 4. 加权 DOP
   * ===================================================================== */
  function weightedDop(sats, rec, sigmas) {
    var n = Array.isArray(sats) ? sats.length : 0;
    if (!Array.isArray(sats) || n < 4) {
      return { ok: false, n: n, reason: 'insufficient satellites (n<4)' };
    }
    if (!rec || !isNum(rec.x) || !isNum(rec.y) || !isNum(rec.z)) {
      return { ok: false, n: n, reason: 'invalid receiver position' };
    }
    var sig = (sigmas === undefined || sigmas === null) ? null : sigmas;
    if (sig !== null && (!Array.isArray(sig) || sig.length !== n)) {
      return { ok: false, n: n, reason: 'sigmas must have one entry per satellite' };
    }

    var i, s, raw, sumRaw = 0;
    var p = new Float64Array(n);
    if (sig !== null) {
      for (i = 0; i < n; i++) {
        s = sig[i];
        if (!isNum(s) || !(s > 0)) {
          return { ok: false, n: n, reason: 'invalid sigma[' + i + '] (must be finite > 0)' };
        }
        raw = 1 / (s * s);
        if (!isFinite(raw) || !(raw > 0)) {
          return { ok: false, n: n, reason: 'invalid sigma[' + i + '] (precision weight not finite)' };
        }
        p[i] = raw;
        sumRaw += raw;
        if (!isFinite(sumRaw)) {
          return { ok: false, n: n, reason: 'invalid sigmas (sum of weights not finite)' };
        }
      }
      /* 归一化到平均权重 1：w_i = (1/sigma_i^2) / mean(1/sigma^2) */
      var meanRaw = sumRaw / n;
      if (!isFinite(meanRaw) || !(meanRaw > 0)) {
        return { ok: false, n: n, reason: 'invalid sigmas (mean weight not finite)' };
      }
      for (i = 0; i < n; i++) p[i] = p[i] / meanRaw;
    } else {
      for (i = 0; i < n; i++) p[i] = 1;
    }

    var rows = new Float64Array(n * 4);
    var err = fillRows(sats, n, rec.x, rec.y, rec.z, rows);
    if (err) return { ok: false, n: n, reason: err };

    var d = dopFromRows(rows, p, n, rec);
    if (!d.ok) return { ok: false, n: n, reason: d.reason };
    return {
      ok: true, n: n,
      gdop: d.gdop, pdop: d.pdop, hdop: d.hdop, vdop: d.vdop, tdop: d.tdop
    };
  }

  /* =====================================================================
   * 5. 加权最小二乘
   * ===================================================================== */
  function solveWeighted(meas, opts) {
    var o = opts || {};
    var n = Array.isArray(meas) ? meas.length : 0;
    var g = o.guess || {};
    var clockGuess = (o.clockBiasGuess !== undefined) ? o.clockBiasGuess : g.clockBias;
    var state = [
      numOr(g.x, 0), numOr(g.y, 0), numOr(g.z, 0), numOr(clockGuess, 0)
    ];
    var maxIter = intOr(o.maxIter, DEF_MAX_ITER, 1, 200);
    var tolM = numOr(o.tolM, DEF_TOL_M);
    if (!(tolM > 0)) tolM = DEF_TOL_M;
    var dof = n > 4 ? n - 4 : 0;
    var empty = [];

    function pack(ok, reason, iters, converged, residuals, rms, wRms, dop) {
      return {
        ok: ok,
        reason: reason,
        x: state[0], y: state[1], z: state[2], clockBias: state[3],
        iterations: iters,
        converged: converged,
        residuals: residuals,
        rms: rms,
        weightedRms: wRms,
        gdop: (dop && dop.ok) ? dop.gdop : null,
        pdop: (dop && dop.ok) ? dop.pdop : null,
        hdop: (dop && dop.ok) ? dop.hdop : null,
        vdop: (dop && dop.ok) ? dop.vdop : null,
        dof: dof,
        n: n
      };
    }
    function fail(reason, iters) {
      return pack(false, reason, iters || 0, false, empty, 0, 0, null);
    }

    if (!Array.isArray(meas) || n < 4) {
      return fail('insufficient measurements (n<4)');
    }

    /* ---- 解析权重：sigmas（米）优先；否则 weights（无量纲）；否则等权 ---- */
    var pw = new Float64Array(n);
    var i;
    var useSigmas = (o.sigmas !== undefined && o.sigmas !== null);
    var useWeights = (o.weights !== undefined && o.weights !== null);

    if (useSigmas) {
      var sig = o.sigmas;
      if (!Array.isArray(sig) || sig.length !== n) {
        return fail('sigmas must have one entry per measurement');
      }
      var sumRaw = 0;
      for (i = 0; i < n; i++) {
        var s = sig[i];
        if (!isNum(s) || !(s > 0)) {
          return fail('invalid sigma[' + i + '] (must be finite > 0)');
        }
        var raw = 1 / (s * s);
        if (!isFinite(raw) || !(raw > 0)) {
          return fail('invalid sigma[' + i + '] (precision weight not finite)');
        }
        pw[i] = raw;
        sumRaw += raw;
        if (!isFinite(sumRaw)) {
          return fail('invalid sigmas (sum of weights not finite)');
        }
      }
      /* 归一化到平均权重 1：整体缩放不改变加权最小二乘解 */
      var meanRaw0 = sumRaw / n;
      if (!isFinite(meanRaw0) || !(meanRaw0 > 0)) {
        return fail('invalid sigmas (mean weight not finite)');
      }
      for (i = 0; i < n; i++) pw[i] = pw[i] / meanRaw0;
    } else if (useWeights) {
      var wt = o.weights;
      if (!Array.isArray(wt) || wt.length !== n) {
        return fail('weights must have one entry per measurement');
      }
      var sumW = 0;
      for (i = 0; i < n; i++) {
        var w = wt[i];
        if (!isNum(w) || !(w > 0)) {
          return fail('invalid weight[' + i + '] (must be finite > 0)');
        }
        sumW += w;
        if (!isFinite(sumW)) {
          return fail('invalid weights (sum not finite)');
        }
      }
      var meanW = sumW / n;
      if (!isFinite(meanW) || !(meanW > 0)) {
        return fail('invalid weights (mean not finite)');
      }
      for (i = 0; i < n; i++) pw[i] = wt[i] / meanW;
    } else {
      for (i = 0; i < n; i++) pw[i] = 1;
    }

    /* ---- 等权：直接复用既有 solvePosition，保证逐位一致 ---- */
    var pmin = Infinity, pmax = 0;
    for (i = 0; i < n; i++) {
      if (pw[i] < pmin) pmin = pw[i];
      if (pw[i] > pmax) pmax = pw[i];
    }
    var equalWeights = isFinite(pmin) && isFinite(pmax) && pmax > 0 &&
      (pmax - pmin) <= 1e-12 * pmax;

    if (equalWeights && typeof GNSS.solvePosition === 'function') {
      var base = GNSS.solvePosition(meas, o) || {};
      state[0] = isNum(base.x) ? base.x : state[0];
      state[1] = isNum(base.y) ? base.y : state[1];
      state[2] = isNum(base.z) ? base.z : state[2];
      state[3] = isNum(base.clockBias) ? base.clockBias : state[3];

      var baseRes = Array.isArray(base.residuals) ? base.residuals : [];
      var ss = 0, swr = 0, sw = 0;
      for (i = 0; i < baseRes.length && i < n; i++) {
        var rb = isNum(baseRes[i]) ? baseRes[i] : 0;
        ss += rb * rb;
        swr += pw[i] * rb * rb;
        sw += pw[i];
      }
      var rms0 = Math.sqrt(ss / n);
      var wRms0 = sw > 0 ? Math.sqrt(swr / sw) : 0;
      var dop0 = null;
      if (base.ok) {
        dop0 = dopAtList(meas, n, state[0], state[1], state[2], pw);
      }
      return pack(
        !!base.ok,
        base.reason || '',
        numOr(base.iterations, 0),
        !!base.converged,
        baseRes,
        isFinite(rms0) ? rms0 : 0,
        isFinite(wRms0) ? wRms0 : 0,
        dop0
      );
    }

    /* ---- 非等权：迭代加权最小二乘 ---- */
    var px = new Float64Array(n);
    var py = new Float64Array(n);
    var pz = new Float64Array(n);
    var pr = new Float64Array(n);
    for (i = 0; i < n; i++) {
      var mm = meas[i] || {};
      px[i] = mm.x;
      py[i] = mm.y;
      pz[i] = mm.z;
      pr[i] = mm.prM;
      if (!isNum(px[i]) || !isNum(py[i]) || !isNum(pz[i]) || !isNum(pr[i])) {
        return fail('non-finite measurement data at index ' + i);
      }
    }

    var rows = new Float64Array(n * 4);
    var resv = new Float64Array(n);
    var N = new Float64Array(16);
    var rhs = new Float64Array(4);
    var trial = new Float64Array(4);
    var iterations = 0;
    var converged = false;
    var degenerate = false;
    var reason = '';
    var cost = 0;

    function build(st) {
      cost = 0;
      for (var k = 0; k < n; k++) {
        var dx = px[k] - st[0], dy = py[k] - st[1], dz = pz[k] - st[2];
        var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!isFinite(rho) || !(rho > 0)) return false;
        var ux = dx / rho, uy = dy / rho, uz = dz / rho;
        rows[k * 4] = -ux;
        rows[k * 4 + 1] = -uy;
        rows[k * 4 + 2] = -uz;
        rows[k * 4 + 3] = 1;
        var r = pr[k] - (rho + st[3]);
        if (!isFinite(r)) return false;
        resv[k] = r;
        var c = pw[k] * r * r;
        if (!isFinite(c)) return false;
        cost += c;
      }
      return isFinite(cost);
    }

    function costAt(st) {
      var c = 0;
      for (var k = 0; k < n; k++) {
        var dx = px[k] - st[0], dy = py[k] - st[1], dz = pz[k] - st[2];
        var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!isFinite(rho)) return Infinity;
        var r = pr[k] - (rho + st[3]);
        var cc = pw[k] * r * r;
        if (!isFinite(cc)) return Infinity;
        c += cc;
      }
      return c;
    }

    for (var it = 0; it < maxIter; it++) {
      iterations = it + 1;
      if (!build(state)) {
        degenerate = true;
        reason = 'degenerate geometry: non-finite residual';
        break;
      }

      var a, b, k;
      for (a = 0; a < 16; a++) N[a] = 0;
      for (a = 0; a < 4; a++) rhs[a] = 0;
      for (k = 0; k < n; k++) {
        var wk = pw[k];
        for (a = 0; a < 4; a++) {
          var ga = wk * rows[k * 4 + a];
          rhs[a] += ga * resv[k];
          for (b = 0; b < 4; b++) N[a * 4 + b] += ga * rows[k * 4 + b];
        }
      }

      var delta = solve4(N, rhs);
      if (!delta) {
        degenerate = true;
        reason = 'degenerate geometry: singular weighted normal matrix';
        break;
      }
      var dn = Math.sqrt(
        delta[0] * delta[0] + delta[1] * delta[1] +
        delta[2] * delta[2] + delta[3] * delta[3]
      );
      if (!isFinite(dn)) {
        degenerate = true;
        reason = 'degenerate geometry: non-finite step';
        break;
      }
      if (dn < tolM) {
        converged = true;
        reason = 'converged';
        break;
      }

      /* 回溯：只接受使加权代价严格下降的步长 */
      var accepted = false, scale = 1;
      for (var attempt = 0; attempt < 32; attempt++) {
        trial[0] = state[0] + scale * delta[0];
        trial[1] = state[1] + scale * delta[1];
        trial[2] = state[2] + scale * delta[2];
        trial[3] = state[3] + scale * delta[3];
        if (!isFinite(trial[0]) || !isFinite(trial[1]) ||
            !isFinite(trial[2]) || !isFinite(trial[3])) break;
        var cTrial = costAt(trial);
        if (cTrial < cost) {
          state[0] = trial[0];
          state[1] = trial[1];
          state[2] = trial[2];
          state[3] = trial[3];
          accepted = true;
          break;
        }
        scale *= 0.5;
        if (scale < 1e-9) break;
      }
      if (!accepted) {
        reason = 'line search failed: no cost-decreasing step';
        break;
      }
    }

    if (!reason) {
      reason = converged ? 'converged' : 'maxIter reached without convergence';
    }
    if (degenerate) return fail(reason, iterations);
    if (!isFinite(state[0]) || !isFinite(state[1]) ||
        !isFinite(state[2]) || !isFinite(state[3])) {
      return fail('non-finite solution state', iterations);
    }
    if (!build(state)) {
      return fail('degenerate geometry: non-finite final residual', iterations);
    }

    var residuals = new Array(n);
    var ss2 = 0, swr2 = 0, sw2 = 0;
    for (i = 0; i < n; i++) {
      var rFinal = resv[i];
      residuals[i] = rFinal;
      ss2 += rFinal * rFinal;
      swr2 += pw[i] * rFinal * rFinal;
      sw2 += pw[i];
    }
    var rms = Math.sqrt(ss2 / n);
    var wRms = sw2 > 0 ? Math.sqrt(swr2 / sw2) : 0;
    if (!isFinite(rms)) { rms = 0; reason = 'non-finite RMS'; converged = false; }
    if (!isFinite(wRms)) { wRms = 0; reason = 'non-finite weighted RMS'; converged = false; }

    /* 最终解处的加权 DOP（同一相对权口径） */
    var dop = dopFromRows(rows, pw, n, { x: state[0], y: state[1], z: state[2] });
    var ok = converged && !degenerate;
    return pack(ok, reason, iterations, converged, residuals, rms, wRms, dop);
  }

  GNSS.uereSigma = uereSigma;
  GNSS.weightedDop = weightedDop;
  GNSS.solveWeighted = solveWeighted;
})();
