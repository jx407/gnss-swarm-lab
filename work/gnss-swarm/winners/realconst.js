/* GNSS.realConst - 真实 GPS 星座快照（简化开普勒传播 v7 时间口径）
 * 数据来源：CelesTrak TLE 平均根数（2026-10-05），未做 SGP4 摄动，
 * 数小时内位置误差为公里级——仅供教学演示用途。 */
(function () {
  'use strict';
  var G = globalThis.GNSS = globalThis.GNSS || {};

  /* GMST 计算（格林威治恒星时，从 Unix 秒到弧度）
   * 公式：θ = 280.46061837 + 360.98564736629·(JD − 2451545) 度
   * JD = unixSec/86400 + 2440587.5 */
  G.gmstFromUnix = function (unixSec) {
    var JD = unixSec / 86400 + 2440587.5;
    var degGMST = 280.46061837 + 360.98564736629 * (JD - 2451545);
    return degGMST * Math.PI / 180;
  };

  /* 角度归一化到 [0, 2π) */
  function normalizeAngle(rad) {
    var twoPi = 2 * Math.PI;
    var v = rad % twoPi;
    if (v < 0) v += twoPi;
    return v;
  }

  /* 解开普勒方程 E − e·sinE = M（牛顿迭代）
   * 收敛判据：|ΔE| < 1e-12，最多 30 次 */
  function solveKepler(M, e) {
    var E = M;
    for (var i = 0; i < 30; i++) {
      var f = E - e * Math.sin(E) - M;
      var fp = 1 - e * Math.cos(E);
      var delta = f / fp;
      E -= delta;
      if (Math.abs(delta) < 1e-12) break;
    }
    return E;
  }

  /* Rz 旋转矩阵（绕 z 轴旋转角度 th）应用到向量 (x, y, z) */
  function rotZ(x, y, z, th) {
    var c = Math.cos(th), s = Math.sin(th);
    return { x: c * x - s * y, y: s * x + c * y, z: z };
  }

  /* Rx 旋转矩阵（绕 x 轴旋转角度 th）应用到向量 (x, y, z) */
  function rotX(x, y, z, th) {
    var c = Math.cos(th), s = Math.sin(th);
    return { x: x, y: c * y - s * z, z: s * y + c * z };
  }

  /* 计算 T0：REAL_GPS_ELEMENTS 中最大历元 Unix 秒 */
  function computeT0() {
    if (!G.REAL_GPS_ELEMENTS || !Array.isArray(G.REAL_GPS_ELEMENTS)) return 0;
    var maxEpoch = 0;
    for (var k = 0; k < G.REAL_GPS_ELEMENTS.length; k++) {
      var epochStr = G.REAL_GPS_ELEMENTS[k].epoch;
      /* 确保解析为 UTC：epoch 格式为 "2026-10-05T22:32:31.853184"，需加 Z */
      var epochUnix = Date.parse(epochStr + 'Z') / 1000;
      if (epochUnix > maxEpoch) maxEpoch = epochUnix;
    }
    return maxEpoch;
  }

  G.realConst = function (relSec, opts) {
    /* 健壮性检查 */
    if (!G.REAL_GPS_ELEMENTS || !Array.isArray(G.REAL_GPS_ELEMENTS)) return [];
    if (!Number.isFinite(relSec)) return [];

    /* v7 时间口径：tRef = opts?.refUnix ?? T0 */
    var tRef = (opts && Number.isFinite(opts.refUnix)) ? opts.refUnix : G.realConst.T0;
    var D = Math.PI / 180;
    var results = [];

    /* 统一参考时刻的 GMST（应用到所有卫星的 ECEF 转换）*/
    var gmst = G.gmstFromUnix(tRef + relSec);

    for (var k = 0; k < G.REAL_GPS_ELEMENTS.length; k++) {
      var elem = G.REAL_GPS_ELEMENTS[k];
      
      /* 解析历元时刻（ISO 字符串转 Unix 秒，确保 UTC）*/
      var epochUnix = Date.parse(elem.epoch + 'Z') / 1000;
      
      /* v7 口径：每颗星相对自身历元的 Δt */
      var dt = (tRef + relSec) - epochUnix;
      
      /* 计算平近点角 M = m0 + n·Δt，归一化到 [0, 2π) */
      var M = elem.m0Deg * D + elem.nRadPerSec * dt;
      M = normalizeAngle(M);

      /* 解开普勒方程得偏近点角 E */
      var E = solveKepler(M, elem.e);

      /* 真近点角 ν = 2·atan2(√(1+e)·sin(E/2), √(1−e)·cos(E/2)) */
      var sqrtFactor1 = Math.sqrt(1 + elem.e);
      var sqrtFactor2 = Math.sqrt(1 - elem.e);
      var nu = 2 * Math.atan2(sqrtFactor1 * Math.sin(E / 2), sqrtFactor2 * Math.cos(E / 2));

      /* 向径 r = a·(1 − e·cosE) */
      var r = elem.aM * (1 - elem.e * Math.cos(E));

      /* 轨道平面坐标 */
      var px = r * Math.cos(nu);
      var py = r * Math.sin(nu);
      var pz = 0;

      /* 旋转序列：Rz(ω) → Rx(i) → Rz(Ω) 得到 ECI */
      var omega = elem.argpDeg * D;
      var inc = elem.iDeg * D;
      var raan = elem.raanDeg * D;

      var p1 = rotZ(px, py, pz, omega);
      var p2 = rotX(p1.x, p1.y, p1.z, inc);
      var pECI = rotZ(p2.x, p2.y, p2.z, raan);

      /* ECEF = Rz(−GMST)·ECI（统一参考时刻）*/
      var pECEF = rotZ(pECI.x, pECI.y, pECI.z, -gmst);

      /* 组装结果 */
      results.push({
        prn: elem.prn,
        norad: elem.norad,
        sys: 'G',
        x: pECEF.x,
        y: pECEF.y,
        z: pECEF.z,
        aM: elem.aM,
        e: elem.e,
        iDeg: elem.iDeg,
        periodS: 2 * Math.PI / elem.nRadPerSec
      });
    }

    return results;
  };

  /* 导出 T0 常数（最大历元 Unix 秒）*/
  G.realConst.T0 = computeT0();
})();
