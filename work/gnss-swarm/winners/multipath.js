/* GNSS.multipath —— 镜面多径几何与伪距偏差 · 候选 B（独立实现，零依赖纯 JS）
 *
 * 运行环境：浏览器 <script> 或 Node ≥ 18（require）。挂到 globalThis.GNSS，
 * 只新增 rayBlocked / reflectPoint / multipathBias 三个函数，不覆盖其它字段。
 *
 * ── 与候选 A（镜像法 + 参数化线段求交）的技术路线差异 ──
 *   1) 墙面写成隐式平面，一切判定走「有符号距离」 s(p) = (p - wall.point)·n：
 *      接收机/卫星在墙的哪一侧、线段是否穿面，只看 s 的符号和线性插值；
 *   2) 反射点不解「线段 × 平面」交点，而是把接收机镜像后写成等效射线
 *        rec' = rec - 2·dRec·n ,  P(t) = rec' + t·(sat - rec')
 *        s(P(t)) = -dRec + t·(dSat + dRec) = 0  →  t* = dRec / (dRec + dSat)
 *      闭式解 t* 后再代回参数式得反射点（dRec = s(rec)，dSat = s(sat)），
 *      即「反射定律向量形式 + 反射等效射线参数化」；
 *   3) 矩形包含判定在墙面局部二维基 (along, up) 上做区间测试：
 *        along = 把输入 along 对 n 正交化并归一（面内水平方向）
 *        up    = n × along（面内竖直方向，取 z 分量为正的一侧）
 *      横向 = (p - wall.point)·along ∈ ±halfWidthM，高度 = p·up ∈ [zMinM, zMaxM]；
 *      **不做任何「比较 ECEF z 分量」的判定**：高度是投影到 up 的标量，
 *      只有常规竖直墙（法向水平 + along 水平）时 up = ±ẑ，此时才与 §6 所说
 *      「高度按 ECEF z 近似」在数值上重合 —— 这是本节唯一的简化；
 *   4) 三类失效原因各自独立 reason，且遮挡（rayBlocked）优先于其它几何原因。
 *
 * ── 伪距偏差模型（§6 指定的演示用启发式，不是物理真值）──
 *   extraDelayChips  = pathExtraM / (c / 1.023e6)
 *   attenuation      = clamp01(reflectionCoef) · clamp01(corrLoss)   默认 0.5 / 1.0
 *   pseudorangeBiasM = pathExtraM · attenuation · exp(-extraDelayChips / 1.5)
 *   extraDelayChips > 6 → 强制 0（超出相关器搜索窗）
 *
 * 纯函数、确定性、不修改入参；非法输入返回 valid:false（rayBlocked 返回 false），不抛异常。
 *
 * 注（矩形包含判定的口径，2026-10-06 实测记录）：§6 的包含判定作用在**反射点**上。
 *   tests/test-multipath.js 早期版本用 sat=(30,40,20)、halfWidthM=10 断言 valid=false，但该几何的
 *   反射点 = sat→rec' 与 x=0 的交点 = (0, 40/7, 20/7) = (0, 5.714, 2.857)：横向 5.714 ≤ 10、
 *   高度 2.857 ∈ [0,10]，按 §6 语义应为 valid=true（本实现即如此，当时该行 FAIL）。测试随后
 *   改为 sat=(30,100,20)：反射点 y = 100·5/(30+5) = 14.286 > 10，才真正越界，本实现判 valid=false。
 *   即：包含判定只看反射点，不额外要求卫星本身横向落在 ±halfWidthM 内 —— 否则真实几何里
 *   斜视卫星（离墙上万公里、横向偏移巨大）会被全部判无效，面板五不会出现任何反射。
 */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  /* —— 常量（CONTRACT §0）—— */
  var C_LIGHT = 299792458;          /* m/s */
  var F_CODE = 1.023e6;             /* Hz，C/A 码码率 */
  var CHIP_M = C_LIGHT / F_CODE;    /* ≈ 293.052 m / chip */
  var NORMAL_TOL = 1e-6;            /* 法向量单位性容差 */
  var ORTHO_TOL = 1e-9;             /* 正交化后残余长度容差 */
  var EDGE_TOL = 1e-9;              /* 矩形包含的边界容差（m） */
  var PATH_TOL = 1e-9;              /* pathExtraM ≥ 0 的容差（m） */
  var DEG = 180 / Math.PI;

  /* —— 向量小工具（只读，不修改入参）—— */
  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function isVec(p) { return !!p && isNum(p.x) && isNum(p.y) && isNum(p.z); }
  function scl(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y,
             y: a.z * b.x - a.x * b.z,
             z: a.x * b.y - a.y * b.x };
  }
  function nrm(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) {
    var L = nrm(a);
    if (!(L > 0) || !Number.isFinite(L)) return null;
    return { x: a.x / L, y: a.y / L, z: a.z / L };
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function angleDeg(u, axis) {
    var L = nrm(u);
    if (!(L > 0)) return null;
    var c = dot(u, axis) / L;
    if (c > 1) c = 1; else if (c < -1) c = -1;
    return Math.acos(c) * DEG;
  }

  /* —— wall → 内部表示；非法返回 null（调用方转成 valid:false / false，不抛异常）—— */
  function prepWall(wall) {
    if (!wall || !isVec(wall.point) || !isVec(wall.normal) || !isVec(wall.along)) return null;
    if (!isNum(wall.halfWidthM) || wall.halfWidthM < 0) return null;
    if (!isNum(wall.zMinM) || !isNum(wall.zMaxM) || wall.zMaxM < wall.zMinM) return null;

    var nLen = nrm(wall.normal);
    /* 零法向量，或偏离单位向量超过容差 → 非法 wall（§6 判据 4） */
    if (!(nLen > 0) || Math.abs(nLen - 1) > NORMAL_TOL) return null;
    var n = scl(wall.normal, 1 / nLen);

    var a = unit(wall.along);
    if (!a) return null;
    /* 把 along 投到面内：抹掉法向分量后与 n 严格正交 */
    var along = unit(sub(a, scl(n, dot(a, n))));
    if (!along) return null;                 /* along ∥ n：墙面方向退化 */

    var upRaw = cross(n, along);             /* n、along 单位且正交 → |n×along| = 1 */
    var up = unit(upRaw);
    if (!up || nrm(upRaw) <= ORTHO_TOL) return null;
    if (up.z < 0) up = scl(up, -1);          /* 取朝上一侧：常规竖直墙时 up = +ẑ */

    return { p: wall.point, n: n, along: along, up: up,
             halfWidthM: wall.halfWidthM, zMinM: wall.zMinM, zMaxM: wall.zMaxM };
  }

  /* 有符号距离：> 0 表示在法向指向的一侧（§6：法向指向接收机侧） */
  function signedDist(p, W) { return dot(sub(p, W.p), W.n); }

  /* 墙面局部二维基（along, up）上的区间测试，不比较 ECEF 分量 */
  function lateralOffset(p, W) { return dot(sub(p, W.p), W.along); }
  /* 高度必须相对 wall.point 测量（CONTRACT-v2 §6 2026-10-05 歧义修订）：
   * 若写成 dot(p, up) 得到的是绝对投影，真实 ECEF 坐标（|p| ≈ 6.4e6 m）会永远落在墙高区间之外，
   * 面板里就会出现「所有卫星都无有效反射」。 */
  function heightOf(p, W) { return dot(sub(p, W.p), W.up); }
  function insideRect(p, W) {
    var u = lateralOffset(p, W), h = heightOf(p, W);
    return Math.abs(u) <= W.halfWidthM + EDGE_TOL &&
           h >= W.zMinM - EDGE_TOL && h <= W.zMaxM + EDGE_TOL;
  }

  /* —— 遮挡：线段 rec→sat 穿过墙面平面，且交点落在矩形内 —— */
  function rayBlocked(rec, sat, wall) {
    var W = prepWall(wall);
    if (!W || !isVec(rec) || !isVec(sat)) return false;
    var dRec = signedDist(rec, W), dSat = signedDist(sat, W);
    if (!(isNum(dRec) && isNum(dSat))) return false;
    if (dRec * dSat > 0) return false;                 /* 同侧：不穿平面 */
    var den = dRec - dSat;
    if (!(Math.abs(den) > 0)) return false;            /* 线段平行于墙面 */
    var t = dRec / den;
    if (!(t > 0 && t <= 1)) return false;              /* 交点落在线段之外 */
    var hit = add(rec, scl(sub(sat, rec), t));
    return insideRect(hit, W);
  }

  /* —— 反射强度（演示用启发式：反射系数 × 相关器损耗，都夹到 [0,1]）—— */
  function attenuationOf(opts) {
    var o = (opts && typeof opts === 'object') ? opts : {};
    var refl = isNum(o.reflectionCoef) ? clamp01(o.reflectionCoef) : 0.5;
    var corr = isNum(o.corrLoss) ? clamp01(o.corrLoss) : 1.0;
    return clamp01(refl * corr);
  }

  /* —— 反射等效射线的闭式解 ——
     rec'    = rec - 2·dRec·n              （接收机镜像；反射路径 = |sat - rec'|）
     P(t)    = rec' + t·(sat - rec')
     s(P(t)) = -dRec + t·(dSat + dRec) = 0  →  t* = dRec / (dRec + dSat)
     反射点 = P(t*)；directPathM = |sat - rec|；pathExtraM = reflected - direct */
  function mirrorGeom(rec, sat, W, dRec, dSat) {
    var recImg = sub(rec, scl(W.n, 2 * dRec));
    var toSat = sub(sat, recImg);
    var directPathM = nrm(sub(sat, rec));
    var reflectedPathM = nrm(toSat);
    var den = dRec + dSat;
    var t = (Math.abs(den) > 0 && Number.isFinite(den)) ? (dRec / den) : NaN;
    var point = Number.isFinite(t) ? add(recImg, scl(toSat, t)) : null;
    return { recImg: recImg, toSat: toSat, t: t, point: point,
             directPathM: directPathM, reflectedPathM: reflectedPathM,
             pathExtraM: reflectedPathM - directPathM };
  }

  function blankResult(reason, directPathM) {
    return { valid: false, reason: reason, point: null,
             directPathM: isNum(directPathM) ? directPathM : 0,
             reflectedPathM: 0, pathExtraM: 0,
             incidenceDeg: null, reflectionDeg: null, attenuation: 0 };
  }

  /* —— 反射点：闭式求解 + (along, up) 区间测试 —— */
  function reflectPoint(rec, sat, wall, opts) {
    var att = attenuationOf(opts);
    var W = prepWall(wall);
    if (!W || !isVec(rec) || !isVec(sat)) {
      return blankResult('invalid-wall-or-input', (isVec(rec) && isVec(sat)) ? nrm(sub(sat, rec)) : NaN);
    }

    var dRec = signedDist(rec, W), dSat = signedDist(sat, W);
    var g = mirrorGeom(rec, sat, W, dRec, dSat);

    function done(valid, reason) {
      var inc = g.point ? angleDeg(sub(rec, g.point), W.n) : null;
      var ref = g.point ? angleDeg(sub(sat, g.point), W.n) : null;
      var extra = g.pathExtraM;
      if (valid && extra < 0) extra = 0;          /* 数值噪声夹到 0，保证 ≥ 0 */
      return { valid: !!valid, reason: valid ? null : reason, point: g.point,
               directPathM: g.directPathM, reflectedPathM: g.reflectedPathM, pathExtraM: extra,
               incidenceDeg: inc, reflectionDeg: ref, attenuation: valid ? att : 0 };
    }

    /* 失效原因 3：非直视（遮挡），优先于其它几何原因 */
    if (rayBlocked(rec, sat, wall)) return done(false, 'wall-blocks-direct-path');
    /* 失效原因 2：入射/反射任一侧不在墙的正面（法向指向的一侧） */
    if (!(dRec > 0)) return done(false, 'receiver-not-in-front-of-wall');
    if (!(dSat > 0)) return done(false, 'satellite-not-in-front-of-wall');
    if (!g.point) return done(false, 'degenerate-geometry');
    /* 失效原因 1：反射点不在矩形范围内（横向 ±halfWidth、高度 zMin..zMax） */
    if (!insideRect(g.point, W)) return done(false, 'reflection-outside-wall');
    if (!(dot(sub(rec, g.point), W.n) > 0) || !(dot(sub(sat, g.point), W.n) > 0)) {
      return done(false, 'ray-not-on-front-face');
    }
    if (!(g.pathExtraM >= -PATH_TOL)) return done(false, 'negative-extra-path');   /* 镜像方向错 */
    return done(true, null);
  }

  /* —— 伪距偏差（§6 启发式模型）—— */
  function multipathBias(rec, sat, wall, opts) {
    var att = attenuationOf(opts);
    var rp = reflectPoint(rec, sat, wall, opts);
    var chips = isNum(rp.pathExtraM) ? rp.pathExtraM / CHIP_M : 0;
    var bias = 0;
    if (rp.valid && chips <= 6) {
      bias = rp.pathExtraM * att * Math.exp(-chips / 1.5);
    }
    /* extraDelayChips > 6 或几何无效 → 强制 0 */
    return { valid: !!rp.valid, reason: rp.reason,
             pathExtraM: rp.pathExtraM, extraDelayChips: chips, pseudorangeBiasM: bias,
             directPathM: rp.directPathM, reflectedPathM: rp.reflectedPathM,
             attenuation: rp.valid ? att : 0 };
  }

  GNSS.rayBlocked = rayBlocked;
  GNSS.reflectPoint = reflectPoint;
  GNSS.multipathBias = multipathBias;
})();
