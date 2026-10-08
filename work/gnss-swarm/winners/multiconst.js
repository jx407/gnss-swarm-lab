/* GNSS 多系统星座（GPS / Galileo / BeiDou-3 MEO）—— 候选变体 A（CONTRACT-v4 §10）
 *
 * 只负责几何：给定时刻与系统名列表，返回每颗星的 ECEF 位置与系统标签。
 * 系统间钟差（ISB）不在这里建模；MULTI_SYS[sys].sysBiasM 只是给上层参考的示意值。
 *
 * GPS 分支与 winners/ephemeris.js 的 satEcef 采用逐位相同的算式：
 *   RAAN = 60°·k、u = 90°·j + 30°·k + 1.5°·(prn mod 4)、a = A_GPS、i = 55°、
 *   ECEF = Rz(-OMEGA_E·t)·ECI
 * 所以 multiconst(t, ['G']) 与 GNSS.allSats(t) 逐位一致（见 a.test.js 与权威测试）。
 * 契约表把抖动写成 1.5°·(svn mod 4)，其中 svn 为 0 起序号；既有实现用的是 1 起的 prn，
 * 即 (svn+1) mod 4。兼容门槛（与既有星座逐位一致）优先，这里取 (svn+1) mod 4。
 */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  var C = GNSS.CONST || {};

  var DEG = Math.PI / 180;
  var MU = C.mu == null ? 3.986005e14 : C.mu;
  var OMEGA_E = C.OMEGA_E == null ? 7.2921151467e-5 : C.OMEGA_E;
  var A_GPS = C.A_GPS == null ? 26561750 : C.A_GPS;

  /* 每系统元数据：a（米）、i（度）、轨道面数、每面卫星数、系统间钟差参考值（米）。 */
  var MULTI_SYS = {
    G: { aM: A_GPS, iDeg: 55, planes: 6, perPlane: 4, sysBiasM: 0 },
    E: { aM: 29599800, iDeg: 56, planes: 3, perPlane: 8, sysBiasM: 20 },
    C: { aM: 27906100, iDeg: 55, planes: 3, perPlane: 8, sysBiasM: -35 }
  };

  /* 各系统常量预计算：圆轨道平均角速度 n 与倾角三角函数。只依赖上面的元数据。 */
  var ORBIT = {};
  (function precompute() {
    var keys = ['G', 'E', 'C'];
    for (var i = 0; i < keys.length; i++) {
      var m = MULTI_SYS[keys[i]];
      var inc = m.iDeg * DEG;
      ORBIT[keys[i]] = {
        n: Math.sqrt(MU / (m.aM * m.aM * m.aM)),
        cosInc: Math.cos(inc),
        sinInc: Math.sin(inc)
      };
    }
  })();

  /* 单颗卫星的瞬时 ECEF 位置（米）。
   * k / j 由系统内 0 起序号 svn 推出：k = floor(svn/perPlane)、j = svn mod perPlane。 */
  function satEcef(sys, svn, tSec) {
    var m = MULTI_SYS[sys];
    var k = Math.floor(svn / m.perPlane);
    var j = svn % m.perPlane;
    var u0;    /* 轨道面内纬度幅角初值（弧度） */
    var raan0; /* 升交点赤经初值（弧度） */

    if (sys === 'G') {
      u0 = (90 * j + 30 * k) * DEG + ((svn + 1) % 4) * 1.5 * DEG;
      raan0 = 60 * k * DEG;
    } else if (sys === 'E') {
      u0 = (45 * j + 15 * k) * DEG;
      raan0 = (120 * k) * DEG;
    } else {
      u0 = (45 * j + 15 * k + 20) * DEG;
      raan0 = (120 * k + 60) * DEG;
    }

    var o = ORBIT[sys];
    var u = u0 + o.n * tSec;
    var raan = raan0 - OMEGA_E * tSec;
    var cosU = Math.cos(u);
    var sinU = Math.sin(u);
    var cosO = Math.cos(raan);
    var sinO = Math.sin(raan);
    var xOrb = m.aM * cosU;
    var yOrb = m.aM * sinU;

    return {
      x: cosO * xOrb - sinO * o.cosInc * yOrb,
      y: sinO * xOrb + cosO * o.cosInc * yOrb,
      z: o.sinInc * yOrb
    };
  }

  function pad2(v) {
    return v < 10 ? '0' + v : '' + v;
  }

  /* 多系统星座几何。
   * systems 非数组 / 空 → []；未知系统名（含非字符串项）忽略；tSec 非有限数 → []。
   * 重复的系统名按数组逐项处理（同名出现两次就输出两组），不做去重。 */
  function multiconst(tSec, systems) {
    if (typeof tSec !== 'number' || !Number.isFinite(tSec)) return [];
    if (!Array.isArray(systems) || systems.length === 0) return [];

    var out = [];
    for (var i = 0; i < systems.length; i++) {
      var name = systems[i];
      if (typeof name !== 'string') continue;
      if (!Object.prototype.hasOwnProperty.call(MULTI_SYS, name)) continue;
      var m = MULTI_SYS[name];
      var count = m.planes * m.perPlane;
      for (var svn = 0; svn < count; svn++) {
        var p = satEcef(name, svn, tSec);
        out.push({
          sys: name,
          svn: svn,
          prn: name + pad2(svn + 1),
          x: p.x,
          y: p.y,
          z: p.z
        });
      }
    }
    return out;
  }

  GNSS.MULTI_SYS = MULTI_SYS;
  GNSS.multiconst = multiconst;
})();
