/* =====================================================================
 * GNSS 系统间钟差（ISB）感知的多系统最小二乘 —— 候选变体 A
 * 契约：CONTRACT-v5 §11（只新增 GNSS.solveMulti，不重定义任何既有函数）
 * ---------------------------------------------------------------------
 * 观测模型（伪距，米）：prM_i = rho_i + b_ref + isb_{sys_i}
 *   - systems = meas 中系统标识的首次出现顺序（nSystems = 不重复系统数）
 *   - 参考系统：默认取 systems[0]；**只要 meas 含 GPS 就以 G 为基准**。
 *     理由：权威测试 tests/test-isb.js 把注入的 SYS_BIAS{G:0,E:+20,C:-35} 直接
 *     当作期望 isb（即 isb 相对 GPS 报告），而 GNSS.visible() 按仰角降序排序，
 *     该用例的 meas 首项其实是 C。严格按「首次出现」会得到 isb.C=0、isb.E=+55，
 *     与权威测试冲突（变体 B 独立复现了同一结论）。meas 无 GPS 时才退回首项。
 *   - 未知量 = [x, y, z, b_ref, isb_1 ... isb_{m-1}]，个数 nUnknowns = 3 + m
 *   - 设计矩阵每行 = [-ux, -uy, -uz, 1 | e_k]
 *       第 4 列（参考系统钟差）对每一行都取 1；
 *       非参考系统再在自己的 ISB 指示列上加 1。
 *     于是解得 isb_k = 系统 k 相对参考系统的钟差（参考系统恒为 0），
 *     单系统时 isb 列全为 0，退化成 §4/§9 的 4 未知量问题。
 *   - 迭代：delta = (G'WG)^-1 G'Wr，|delta| < tolM 判收敛（同 §9 口径），
 * *     带 1/2 回溯保证加权代价单调下降；法方程奇异 → ok:false（不出 NaN）；
 *     残差已到双精度舍入底噪时判为「数值精确拟合」收敛（否则极紧的 tolM 会误报失败）。
 *   - DOP：用扩展后的设计矩阵算。位置子块旋转到本地 ENU，所以
 *       HDOP^2 + VDOP^2 = PDOP^2；
 *       GDOP^2 = trace(Q) = PDOP^2 + TDOP^2 + Σ(ISB 方差)，ISB 维只进 GDOP。
 *   - 单系统（nUnknowns = 4）复用 GNSS.solveWeighted / solvePosition，
 *     保证与既有解算逐位一致（契约硬要求）。
 *   - 权重口径同 §9：sigmas（米）优先，否则 weights（无量纲），否则等权；
 *     内部归一化到平均权重 1（整体缩放不改变加权最小二乘解）。
 * ===================================================================== */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  var DEG = Math.PI / 180;

  /* WGS-84：仅用于本地 ENU 基的回退计算（优先复用 GNSS.geodeticFromEcef） */
  var WGS84_A = 6378137;
  var WGS84_F = 1 / 298.257223563;
  var WGS84_E2 = WGS84_F * (2 - WGS84_F);
  var WGS84_B = WGS84_A * (1 - WGS84_F);
  var WGS84_EP2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);

  var DEF_MAX_ITER = 20;
  var DEF_TOL_M = 1e-4;

  /* RINEX 系统字母。契约强制识别 G/E/C；R/J/I/S 一并识别（标准 RINEX 字母），
     表外的（例如权威测试里的 'X'）按契约视为 'G'。 */
  var KNOWN_SYS = { G: 1, E: 1, C: 1, R: 1, J: 1, I: 1, S: 1 };

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }
  function numOr(v, d) {
    return isNum(v) ? v : d;
  }
  function intOr(v, d, lo, hi) {
    var t = Math.round(numOr(v, d));
    if (t < lo) t = lo;
    if (t > hi) t = hi;
    return t;
  }

  /* 卫星所属系统：显式 sys 优先，缺省/无法识别时按 prn 首字符推断，再退回 'G' */
  function systemOf(meas) {
    var raw = meas ? meas.sys : undefined;
    if (typeof raw === 'string' && raw.length > 0) {
      var c = raw.charAt(0).toUpperCase();
      if (KNOWN_SYS[c] === 1) return c;
    }
    var lead = (meas && meas.prn != null) ? String(meas.prn).charAt(0).toUpperCase() : '';
    if (KNOWN_SYS[lead] === 1) return lead;
    return 'G';
  }

  /* =====================================================================
   * 1. ECEF -> 大地坐标（优先复用 GNSS.geodeticFromEcef，缺失时 Bowring 回退）
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
      if (Math.abs(latNew - lat) < 1e-15) { lat = latNew; break; }
      lat = latNew;
    }

    sinLat = Math.sin(lat);
    cosLat = Math.cos(lat);
    N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    if (Math.abs(cosLat) >= Math.abs(sinLat)) h = p / cosLat - N;
    else h = z / sinLat - N * (1 - WGS84_E2);
    return { latDeg: lat / DEG, lonDeg: lon / DEG, hM: h };
  }

  /* 行主序 [e; n; u] 三个基向量，与 winners/ephemeris.js 的 dop 口径一致 */
  function enuBasis(x, y, z) {
    var g = null;
    if (typeof GNSS.geodeticFromEcef === 'function') g = GNSS.geodeticFromEcef(x, y, z);
    if (!g || !isNum(g.latDeg) || !isNum(g.lonDeg)) g = geodeticLocal(x, y, z);
    if (!g || !isNum(g.latDeg) || !isNum(g.lonDeg)) return null;

    var lat = g.latDeg * DEG;
    var lon = g.lonDeg * DEG;
    var sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    var sinLon = Math.sin(lon), cosLon = Math.cos(lon);
    return [
      -sinLon, cosLon, 0,
      -sinLat * cosLon, -sinLat * sinLon, cosLat,
      cosLat * cosLon, cosLat * sinLon, sinLat
    ];
  }

  /* =====================================================================
   * 2. p×p 稠密线性代数（部分主元；奇异/非有限一律返回 null）
   * ===================================================================== */
  function solveLinear(m, b, p) {
    var a = new Float64Array(p * p);
    var rhs = new Float64Array(p);
    var maxAbs = 0, i, j, k, v;
    for (i = 0; i < p; i++) {
      for (j = 0; j < p; j++) {
        v = m[i * p + j];
        if (!isFinite(v)) return null;
        a[i * p + j] = v;
        var av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
      if (!isFinite(b[i])) return null;
      rhs[i] = b[i];
    }
    if (maxAbs === 0) return null;
    var minPivot = 1e-12 * maxAbs;

    for (k = 0; k < p; k++) {
      var pr = k, pa = 0;
      for (i = k; i < p; i++) {
        var c = Math.abs(a[i * p + k]);
        if (c > pa) { pa = c; pr = i; }
      }
      if (!isFinite(pa) || pa <= minPivot) return null;
      if (pr !== k) {
        for (j = 0; j < p; j++) {
          var t = a[k * p + j]; a[k * p + j] = a[pr * p + j]; a[pr * p + j] = t;
        }
        var tb = rhs[k]; rhs[k] = rhs[pr]; rhs[pr] = tb;
      }
      var pivot = a[k * p + k];
      if (!isFinite(pivot) || Math.abs(pivot) <= minPivot) return null;
      for (i = k + 1; i < p; i++) {
        var f = a[i * p + k] / pivot;
        if (f === 0) continue;
        a[i * p + k] = 0;
        for (j = k + 1; j < p; j++) a[i * p + j] -= f * a[k * p + j];
        rhs[i] -= f * rhs[k];
      }
    }

    var x = new Float64Array(p);
    for (i = p - 1; i >= 0; i--) {
      var s = rhs[i];
      for (j = i + 1; j < p; j++) s -= a[i * p + j] * x[j];
      var diag = a[i * p + i];
      if (!(Math.abs(diag) > 0)) return null;
      x[i] = s / diag;
      if (!isFinite(x[i])) return null;
    }
    return x;
  }

  function invertMatrix(m, p) {
    var w = 2 * p;
    var a = new Float64Array(p * w);
    var maxAbs = 0, i, j, k;
    for (i = 0; i < p; i++) {
      for (j = 0; j < p; j++) {
        var v = m[i * p + j];
        if (!isFinite(v)) return null;
        a[i * w + j] = v;
        var av = Math.abs(v);
        if (av > maxAbs) maxAbs = av;
      }
      a[i * w + p + i] = 1;
    }
    if (maxAbs === 0) return null;
    var minPivot = 1e-12 * maxAbs;

    for (k = 0; k < p; k++) {
      var pr = k, pa = 0;
      for (i = k; i < p; i++) {
        var c = Math.abs(a[i * w + k]);
        if (c > pa) { pa = c; pr = i; }
      }
      if (!isFinite(pa) || pa <= minPivot) return null;
      if (pr !== k) {
        for (j = 0; j < w; j++) {
          var t = a[k * w + j]; a[k * w + j] = a[pr * w + j]; a[pr * w + j] = t;
        }
      }
      var pivot = a[k * w + k];
      if (!isFinite(pivot) || Math.abs(pivot) <= minPivot) return null;
      for (j = 0; j < w; j++) a[k * w + j] /= pivot;
      for (i = 0; i < p; i++) {
        if (i === k) continue;
        var f = a[i * w + k];
        if (f === 0) continue;
        for (j = 0; j < w; j++) a[i * w + j] -= f * a[k * w + j];
      }
    }

    var inv = new Float64Array(p * p);
    for (i = 0; i < p; i++) {
      for (j = 0; j < p; j++) {
        var val = 0.5 * (a[i * w + p + j] + a[j * w + p + i]);   /* 对称化 */
        if (!isFinite(val)) return null;
        inv[i * p + j] = val;
      }
    }
    return inv;
  }

  /* 位置子块（Q 的前 3 行 3 列）上的二次型 v'Qv */
  function quad3(Q, p, ex, ey, ez) {
    return ex * (Q[0] * ex + Q[1] * ey + Q[2] * ez) +
      ey * (Q[p] * ex + Q[p + 1] * ey + Q[p + 2] * ez) +
      ez * (Q[2 * p] * ex + Q[2 * p + 1] * ey + Q[2 * p + 2] * ez);
  }

  /* 扩展设计矩阵的 DOP（W 已归一化到平均权重 1） */
  function dopFromRows(G, pw, n, p, rec) {
    var N = new Float64Array(p * p);
    var q, a, b;
    for (q = 0; q < n; q++) {
      var wq = pw[q];
      for (a = 0; a < p; a++) {
        var wa = wq * G[q * p + a];
        for (b = 0; b < p; b++) N[a * p + b] += wa * G[q * p + b];
      }
    }

    var Q = invertMatrix(N, p);
    if (!Q) return { ok: false, reason: 'singular weighted normal matrix' };

    var pdop2 = Q[0] + Q[p + 1] + Q[2 * p + 2];
    var tdop2 = Q[3 * p + 3];
    var gdop2 = 0;
    for (a = 0; a < p; a++) gdop2 += Q[a * p + a];

    if (!(pdop2 >= 0) || !(tdop2 >= 0) || !isFinite(gdop2) || gdop2 < 0) {
      return { ok: false, reason: 'invalid weighted normal inverse' };
    }

    var basis = enuBasis(rec.x, rec.y, rec.z);
    if (!basis) return { ok: false, reason: 'cannot derive local ENU frame' };

    var hdop2 = quad3(Q, p, basis[0], basis[1], basis[2]) +
      quad3(Q, p, basis[3], basis[4], basis[5]);
    var vdop2 = quad3(Q, p, basis[6], basis[7], basis[8]);
    var tol = 1e-12 * Math.max(1, pdop2);
    if (hdop2 < -tol || vdop2 < -tol) {
      return { ok: false, reason: 'non-positive ENU variance' };
    }
    if (hdop2 < 0) hdop2 = 0;
    if (vdop2 < 0) vdop2 = 0;

    var pdop = Math.sqrt(pdop2), tdop = Math.sqrt(tdop2), gdop = Math.sqrt(gdop2);
    var hdop = Math.sqrt(hdop2), vdop = Math.sqrt(vdop2);
    if (!isFinite(pdop) || !isFinite(tdop) || !isFinite(gdop) ||
        !isFinite(hdop) || !isFinite(vdop)) {
      return { ok: false, reason: 'non-finite DOP' };
    }
    return { ok: true, gdop: gdop, pdop: pdop, hdop: hdop, vdop: vdop, tdop: tdop };
  }

  /* =====================================================================
   * 3. GNSS.solveMulti
   * ===================================================================== */
  function solveMulti(meas, opts) {
    var o = opts || {};
    var n = Array.isArray(meas) ? meas.length : 0;
    var i, k, a, b;

    /* ---- 系统识别（首次出现顺序）与参考系统（含 GPS 时以 GPS 为基准） ---- */
    var systems = [];
    var seen = {};
    var sysIdx = new Array(n);
    for (i = 0; i < n; i++) {
      var s = systemOf(meas[i]);
      if (seen[s] !== 1) { seen[s] = 1; systems.push(s); }
      sysIdx[i] = systems.indexOf(s);
    }
    var nSys = systems.length;
    var refSys = nSys >= 1 ? systems[0] : '';
    for (i = 0; i < nSys; i++) { if (systems[i] === 'G') { refSys = 'G'; break; } }

    /* 非参考系统 → ISB 未知量下标（4, 5, ...），同时也是设计矩阵的列号 */
    var isbCol = {};
    var colFor = new Array(n);
    var nextCol = 4;
    for (i = 0; i < nSys; i++) {
      if (systems[i] !== refSys) isbCol[systems[i]] = nextCol++;
    }
    for (i = 0; i < n; i++) {
      var lab = systems[sysIdx[i]];
      colFor[i] = (lab === refSys) ? -1 : isbCol[lab];
    }
    var p = nSys >= 1 ? 3 + nSys : 4;      /* nUnknowns = 4 + (nSys-1) */
    var dof = n > p ? n - p : 0;

    /* ---- 初始状态（不修改入参；非有限初值退回 0） ---- */
    var g = (o.guess && typeof o.guess === 'object') ? o.guess : {};
    var clockGuess = (o.clockBiasGuess !== undefined) ? o.clockBiasGuess : g.clockBias;
    var state = new Float64Array(p);
    state[0] = numOr(g.x, 0);
    state[1] = numOr(g.y, 0);
    state[2] = numOr(g.z, 0);
    state[3] = numOr(clockGuess, 0);        /* ISB 初值全 0 */

    function pack(ok, reason, iters, converged, residuals, rms, wRms, dop) {
      for (var q = 0; q < p; q++) if (!isFinite(state[q])) state[q] = 0;  /* 绝不出 NaN */
      var isb = {};
      for (var m = 0; m < nSys; m++) {
        var lb = systems[m];
        isb[lb] = (lb === refSys) ? 0 : state[isbCol[lb]];
      }
      var dOk = !!(dop && dop.ok);
      return {
        ok: ok,
        reason: reason,
        x: state[0], y: state[1], z: state[2], clockBias: state[3],
        isb: isb,
        systems: systems.slice(),
        nSystems: nSys,
        n: n,
        nUnknowns: p,
        dof: dof,
        iterations: iters,
        converged: converged,
        residuals: residuals,
        rms: isFinite(rms) ? rms : 0,
        weightedRms: isFinite(wRms) ? wRms : 0,
        gdop: dOk ? dop.gdop : null,
        pdop: dOk ? dop.pdop : null,
        hdop: dOk ? dop.hdop : null,
        vdop: dOk ? dop.vdop : null,
        tdop: dOk ? dop.tdop : null
      };
    }
    function fail(reason, iters) {
      return pack(false, reason, iters || 0, false, [], 0, 0, null);
    }

    if (!Array.isArray(meas) || n === 0) {
      return fail('insufficient measurements (n<' + p + ')');
    }
    if (n < p) {
      return fail('insufficient measurements (n=' + n + ' < nUnknowns=' + p + ')');
    }
    if (nSys > n) {
      return fail('more systems than measurements (nSys=' + nSys + ' > n=' + n + ')');
    }

    /* ---- 观测有限性检查 ---- */
    var px = new Float64Array(n), py = new Float64Array(n);
    var pz = new Float64Array(n), pr = new Float64Array(n);
    for (i = 0; i < n; i++) {
      var mm = meas[i] || {};
      px[i] = mm.x; py[i] = mm.y; pz[i] = mm.z; pr[i] = mm.prM;
      if (!isNum(px[i]) || !isNum(py[i]) || !isNum(pz[i]) || !isNum(pr[i])) {
        return fail('non-finite measurement data at index ' + i);
      }
    }

    /* ---- 权重：sigmas（米）优先，否则 weights（无量纲），否则等权 ---- */
    var pw = new Float64Array(n);
    var useSigmas = (o.sigmas !== undefined && o.sigmas !== null);
    var useWeights = (o.weights !== undefined && o.weights !== null);

    if (useSigmas) {
      var sig = o.sigmas;
      if (!Array.isArray(sig) || sig.length !== n) {
        return fail('sigmas must have one entry per measurement');
      }
      var sumRaw = 0;
      for (i = 0; i < n; i++) {
        var sg = sig[i];
        if (!isNum(sg) || !(sg > 0)) {
          return fail('invalid sigma[' + i + '] (must be finite > 0)');
        }
        var raw = 1 / (sg * sg);
        if (!isFinite(raw) || !(raw > 0)) {
          return fail('invalid sigma[' + i + '] (precision weight not finite)');
        }
        pw[i] = raw;
        sumRaw += raw;
        if (!isFinite(sumRaw)) return fail('invalid sigmas (sum of weights not finite)');
      }
      var meanRaw = sumRaw / n;
      if (!isFinite(meanRaw) || !(meanRaw > 0)) {
        return fail('invalid sigmas (mean weight not finite)');
      }
      for (i = 0; i < n; i++) pw[i] = pw[i] / meanRaw;
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
        if (!isFinite(sumW)) return fail('invalid weights (sum not finite)');
      }
      var meanW = sumW / n;
      if (!isFinite(meanW) || !(meanW > 0)) {
        return fail('invalid weights (mean not finite)');
      }
      for (i = 0; i < n; i++) pw[i] = wt[i] / meanW;
    } else {
      for (i = 0; i < n; i++) pw[i] = 1;
    }

    var maxIter = intOr(o.maxIter, DEF_MAX_ITER, 1, 200);
    var tolM = numOr(o.tolM, DEF_TOL_M);
    if (!(tolM > 0)) tolM = DEF_TOL_M;

    /* 给定状态下的扩展设计矩阵与残差（同时给出加权代价） */
    var G = new Float64Array(n * p);
    var rvec = new Float64Array(n);
    var cost = 0;
    var meanRange = 1, maxAbsRes = 0;   /* 当前状态下的平均斜距/最大残差（数值精确拟合判定用） */

    function build(st) {
      cost = 0;
      var sumRange = 0, maxR = 0;
      for (var q = 0; q < n; q++) {
        var dx = px[q] - st[0], dy = py[q] - st[1], dz = pz[q] - st[2];
        var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!isFinite(rho) || !(rho > 1e-9)) return false;
        var row = q * p;
        G[row] = -dx / rho;
        G[row + 1] = -dy / rho;
        G[row + 2] = -dz / rho;
        G[row + 3] = 1;                                  /* 参考系统钟差：每行都参与 */
        for (a = 4; a < p; a++) G[row + a] = 0;
        var kc = colFor[q];
        var clk = st[3];
        if (kc >= 0) {                                    /* 非参考系统：叠加自己的 ISB 列 */
          G[row + kc] = 1;                                /* 状态下标 = 设计矩阵列号 */
          clk += st[kc];
        }
        var r = pr[q] - (rho + clk);
        if (!isFinite(r)) return false;
        rvec[q] = r;
        var ar = Math.abs(r);
        if (ar > maxR) maxR = ar;
        sumRange += rho;
        var c = pw[q] * r * r;
        if (!isFinite(c)) return false;
        cost += c;
      }
      meanRange = sumRange / n;
      maxAbsRes = maxR;
      return isFinite(cost);
    }

    function costAt(st) {
      var c = 0;
      for (var q = 0; q < n; q++) {
        var dx = px[q] - st[0], dy = py[q] - st[1], dz = pz[q] - st[2];
        var rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!isFinite(rho)) return Infinity;
        var kc = colFor[q];
        var clk = st[3] + (kc >= 0 ? st[kc] : 0);
        var r = pr[q] - (rho + clk);
        var cc = pw[q] * r * r;
        if (!isFinite(cc)) return Infinity;
        c += cc;
      }
      return c;
    }

    var N = new Float64Array(p * p);
    var rhs = new Float64Array(p);
    var trial = new Float64Array(p);
    var iterations = 0, converged = false, degenerate = false, reason = '';
    /* 单系统（nUnknowns=4）直接交给 §9 的解算器，避免重复迭代 */
    var delegateSingle = (nSys === 1 && typeof GNSS.solveWeighted === 'function');

    if (!delegateSingle) for (var it = 0; it < maxIter; it++) {
      iterations = it + 1;
      if (!build(state)) {
        degenerate = true; reason = 'degenerate geometry: non-finite residual'; break;
      }

      for (a = 0; a < p * p; a++) N[a] = 0;
      for (a = 0; a < p; a++) rhs[a] = 0;
      for (k = 0; k < n; k++) {
        var wk = pw[k];
        for (a = 0; a < p; a++) {
          var ga = wk * G[k * p + a];
          rhs[a] += ga * rvec[k];
          for (b = 0; b < p; b++) N[a * p + b] += ga * G[k * p + b];
        }
      }

      var delta = solveLinear(N, rhs, p);
      if (!delta) {
        degenerate = true; reason = 'degenerate geometry: singular weighted normal matrix'; break;
      }
      var dn2 = 0;
      for (a = 0; a < p; a++) dn2 += delta[a] * delta[a];
      var dn = Math.sqrt(dn2);
      if (!isFinite(dn)) {
        degenerate = true; reason = 'degenerate geometry: non-finite step'; break;
      }
      if (dn < tolM) { converged = true; reason = 'converged'; break; }

      /* 回溯：加权代价只允许下降（GN 方向是下降方向，足够小的步长必成功） */
      var accepted = false, scale = 1;
      for (var attempt = 0; attempt < 40; attempt++) {
        var okTrial = true;
        for (a = 0; a < p; a++) {
          trial[a] = state[a] + scale * delta[a];
          if (!isFinite(trial[a])) okTrial = false;
        }
        if (!okTrial) break;
        if (costAt(trial) < cost) {
          for (a = 0; a < p; a++) state[a] = trial[a];
          accepted = true;
          break;
        }
        scale *= 0.5;
        if (scale < 1e-12) break;
      }
      if (!accepted) {
        /* 残差已降到双精度舍入底噪（≈1e-13 × 斜距）时，GN 步再小也无法让代价继续下降
           —— 这属于「数值上的精确拟合」，按收敛处理，而不是误报 line search 失败。 */
        if (maxAbsRes <= 1e-13 * meanRange) {
          converged = true;
          reason = 'converged (numerical exact fit)';
          break;
        }
        reason = 'line search failed: no cost-decreasing step';
        break;
      }
    }

    if (!reason) reason = converged ? 'converged' : 'maxIter reached without convergence';
    if (degenerate) return fail(reason, iterations);

    /* ---- 单系统：复用既有解算，保证与 solveWeighted / solvePosition 一致 ---- */
    if (delegateSingle) {
      var base = GNSS.solveWeighted(meas, o) || {};
      if (isNum(base.x)) state[0] = base.x;
      if (isNum(base.y)) state[1] = base.y;
      if (isNum(base.z)) state[2] = base.z;
      if (isNum(base.clockBias)) state[3] = base.clockBias;

      /* 在最终解处重建 4 列设计矩阵，用同一套 DOP 口径输出 gdop/pdop/hdop/vdop */
      var dopS = build(state)
        ? dopFromRows(G, pw, n, p, { x: state[0], y: state[1], z: state[2] })
        : null;
      var rsS = Array.isArray(base.residuals) ? base.residuals.slice() : [];
      return pack(!!base.ok, base.reason || '', numOr(base.iterations, iterations),
        !!base.converged, rsS, numOr(base.rms, 0), numOr(base.weightedRms, 0), dopS);
    }

    /* ---- 多系统：最终残差、RMS 与扩展 DOP ---- */
    if (!build(state)) return fail('degenerate geometry: non-finite final residual', iterations);

    var residuals = new Array(n);
    var ss = 0, swr = 0, sw = 0;
    for (i = 0; i < n; i++) {
      residuals[i] = rvec[i];
      ss += rvec[i] * rvec[i];
      swr += pw[i] * rvec[i] * rvec[i];
      sw += pw[i];
    }
    var rms = Math.sqrt(ss / n);
    var wRms = sw > 0 ? Math.sqrt(swr / sw) : 0;
    var ok = converged && !degenerate && isFinite(rms) && isFinite(wRms);
    var dop = dopFromRows(G, pw, n, p, { x: state[0], y: state[1], z: state[2] });
    return pack(ok, reason, iterations, converged, residuals, rms, wRms, dop);
  }

  GNSS.solveMulti = solveMulti;
})();
