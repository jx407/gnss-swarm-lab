/* GNSS ephemeris / geometry / DOP candidate fix1.
 *
 * Contract model:
 *   u(t)       = 90 deg * j + 30 deg * k + 1.5 deg * (prn mod 4) + n*t
 *              （标准 Walker 24/6/2 相位 + 每星 ≤4.5° 的确定性抖动：纯 30°/面 时 Δk=3、Δj=1 的卫星对
 *               会在同时过交点瞬间严格重合，独立复核实测 t=0 时距离 0.000 m、可见集天球夹角 0.0000°）
 *   RAAN_eff   = 60 deg * k - OMEGA_E * t
 *   r_ECEF(t)  = Rz(-OMEGA_E*t) * r_ECI(t)
 *
 * The last equation is what makes ECEF satellite velocity differ from the
 * fixed 3873.8 m/s inertial circular speed.  It also makes the de-rotated
 * ECEF orbit repeat with the inertial orbital period.
 */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  var C = GNSS.CONST || {};

  var MU = C.mu == null ? 3.986005e14 : C.mu;
  var OMEGA_E = C.OMEGA_E == null ? 7.2921151467e-5 : C.OMEGA_E;
  var A_GPS = C.A_GPS == null ? 26561750 : C.A_GPS;
  var INC_DEG = C.INC_DEG == null ? 55 : C.INC_DEG;

  var WGS84_A = 6378137;
  var WGS84_F = 1 / 298.257223563;
  var WGS84_E2 = WGS84_F * (2 - WGS84_F);
  var WGS84_B = WGS84_A * (1 - WGS84_F);
  var WGS84_EP2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) /
    (WGS84_B * WGS84_B);

  var DEG = Math.PI / 180;
  var TWO_PI = 2 * Math.PI;
  var INC = INC_DEG * DEG;
  var COS_INC = Math.cos(INC);
  var SIN_INC = Math.sin(INC);
  var N_ORBIT = Math.sqrt(MU / (A_GPS * A_GPS * A_GPS));

  function finiteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function finiteXyz(p) {
    return !!p && finiteNumber(p.x) && finiteNumber(p.y) && finiteNumber(p.z);
  }

  function validPrn(prn) {
    return Number.isInteger(prn) && prn >= 1 && prn <= 24;
  }

  /* WGS-84 geodetic -> ECEF. */
  function ecefFromGeodetic(latDeg, lonDeg, hM) {
    if (!finiteNumber(latDeg) || !finiteNumber(lonDeg) || !finiteNumber(hM)) {
      return null;
    }

    var lat = latDeg * DEG;
    var lon = lonDeg * DEG;
    var sinLat = Math.sin(lat);
    var cosLat = Math.cos(lat);
    var sinLon = Math.sin(lon);
    var cosLon = Math.cos(lon);
    var N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    var rho = (N + hM) * cosLat;

    return {
      x: rho * cosLon,
      y: rho * sinLon,
      z: (N * (1 - WGS84_E2) + hM) * sinLat
    };
  }

  /* WGS-84 ECEF -> geodetic.  The fixed-point latitude iteration converges
   * rapidly for terrestrial and near-Earth points; the polar axis is handled
   * separately. */
  function geodeticFromEcef(x, y, z) {
    if (!finiteNumber(x) || !finiteNumber(y) || !finiteNumber(z)) {
      return null;
    }

    var lon = Math.atan2(y, x);
    var p = Math.hypot(x, y);
    var lat;
    var h;
    var sinLat;
    var cosLat;
    var N;

    if (p < 1e-12) {
      lat = z >= 0 ? Math.PI / 2 : -Math.PI / 2;
      h = Math.abs(z) - WGS84_B;
      return { latDeg: lat / DEG, lonDeg: lon / DEG, hM: h };
    }

    /* Bowring's initial latitude. */
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

      if (Math.abs(cosLat) >= Math.abs(sinLat)) {
        h = p / cosLat - N;
      } else {
        h = z / sinLat - N * (1 - WGS84_E2);
      }

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
    if (Math.abs(cosLat) >= Math.abs(sinLat)) {
      h = p / cosLat - N;
    } else {
      h = z / sinLat - N * (1 - WGS84_E2);
    }

    return { latDeg: lat / DEG, lonDeg: lon / DEG, hM: h };
  }

  /* Instantaneous ECEF position, in metres. */
  function satEcef(prn, tSec) {
    if (!validPrn(prn) || !finiteNumber(tSec)) return null;

    var zeroBased = prn - 1;
    var k = Math.floor(zeroBased / 4);
    var j = zeroBased % 4;

    /* 标准 Walker 24/6/2（30°/面）保证几何最均匀；再叠加每星 1.5°·(prn mod 4) 的确定性相位抖动，
     * 用来消除 Δk=3、Δj=1 的卫星对在同时过交点时严格重合的伪影（真实星座也有轨道槽位误差）。 */
    var u0 = (90 * j + 30 * k) * DEG + (prn % 4) * 1.5 * DEG;
    var raan0 = 60 * k * DEG;
    var u = u0 + N_ORBIT * tSec;
    var raanEff = raan0 - OMEGA_E * tSec;

    var cosU = Math.cos(u);
    var sinU = Math.sin(u);
    var cosO = Math.cos(raanEff);
    var sinO = Math.sin(raanEff);
    var xOrb = A_GPS * cosU;
    var yOrb = A_GPS * sinU;

    return {
      x: cosO * xOrb - sinO * COS_INC * yOrb,
      y: sinO * xOrb + cosO * COS_INC * yOrb,
      z: SIN_INC * yOrb
    };
  }

  function allSats(tSec) {
    if (!finiteNumber(tSec)) return [];
    var out = [];
    for (var prn = 1; prn <= 24; prn++) {
      var p = satEcef(prn, tSec);
      if (!p) return [];
      out.push({ prn: prn, x: p.x, y: p.y, z: p.z });
    }
    return out;
  }

  /* Central difference of satEcef.  Because satEcef already applies
   * Rz(-OMEGA_E*t), its derivative includes v_ECI - OMEGA_E x r. */
  function satVelocity(prn, tSec) {
    if (!validPrn(prn) || !finiteNumber(tSec)) return null;
    var half = 0.05;
    var p0 = satEcef(prn, tSec - half);
    var p1 = satEcef(prn, tSec + half);
    if (!p0 || !p1) return null;
    return {
      x: (p1.x - p0.x) / (2 * half),
      y: (p1.y - p0.y) / (2 * half),
      z: (p1.z - p0.z) / (2 * half)
    };
  }

  function lookAngles(rec, sat) {
    if (!finiteXyz(rec) || !finiteXyz(sat)) return null;
    var geo = geodeticFromEcef(rec.x, rec.y, rec.z);
    if (!geo) return null;

    var dx = sat.x - rec.x;
    var dy = sat.y - rec.y;
    var dz = sat.z - rec.z;
    var rangeM = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(rangeM)) return null;
    if (rangeM === 0) {
      return { azDeg: 0, elDeg: 90, rangeM: 0 };
    }

    var lat = geo.latDeg * DEG;
    var lon = geo.lonDeg * DEG;
    var sinLat = Math.sin(lat);
    var cosLat = Math.cos(lat);
    var sinLon = Math.sin(lon);
    var cosLon = Math.cos(lon);

    var east = -sinLon * dx + cosLon * dy;
    var north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
    var up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

    var elArg = up / rangeM;
    if (elArg > 1) elArg = 1;
    if (elArg < -1) elArg = -1;

    return {
      azDeg: (Math.atan2(east, north) / DEG + 360) % 360,
      elDeg: Math.asin(elArg) / DEG,
      rangeM: rangeM
    };
  }

  function visible(sats, rec, maskDeg) {
    if (!sats || typeof sats.length !== 'number' || !finiteXyz(rec)) return [];
    var mask = finiteNumber(maskDeg) ? maskDeg : 0;
    var out = [];

    for (var i = 0; i < sats.length; i++) {
      var sat = sats[i];
      if (!finiteXyz(sat)) continue;
      var la = lookAngles(rec, sat);
      if (!la || la.elDeg < mask) continue;
      out.push({
        prn: sat.prn,
        azDeg: la.azDeg,
        elDeg: la.elDeg,
        rangeM: la.rangeM,
        x: sat.x,
        y: sat.y,
        z: sat.z
      });
    }

    out.sort(function (a, b) {
      if (b.elDeg !== a.elDeg) return b.elDeg - a.elDeg;
      return (a.prn == null ? 0 : a.prn) - (b.prn == null ? 0 : b.prn);
    });
    return out;
  }

  function invert4(m) {
    var n = 4;
    var a = new Array(n);
    var maxAbs = 0;
    var i;
    var j;
    var k;

    for (i = 0; i < n; i++) {
      a[i] = new Array(2 * n);
      for (j = 0; j < n; j++) {
        var v = m[i][j];
        a[i][j] = v;
        if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
        a[i][j + n] = i === j ? 1 : 0;
      }
    }

    if (!Number.isFinite(maxAbs) || maxAbs === 0) return null;
    var minPivot = 1e-12 * maxAbs;

    for (k = 0; k < n; k++) {
      var pivotRow = k;
      var pivotAbs = 0;
      for (i = k; i < n; i++) {
        var candidate = Math.abs(a[i][k]);
        if (candidate > pivotAbs) {
          pivotAbs = candidate;
          pivotRow = i;
        }
      }
      if (!Number.isFinite(pivotAbs) || pivotAbs <= minPivot) return null;

      if (pivotRow !== k) {
        var tmp = a[k];
        a[k] = a[pivotRow];
        a[pivotRow] = tmp;
      }

      var pivot = a[k][k];
      if (!Number.isFinite(pivot) || Math.abs(pivot) <= minPivot) return null;
      for (j = 0; j < 2 * n; j++) a[k][j] /= pivot;

      for (i = 0; i < n; i++) {
        if (i === k) continue;
        var factor = a[i][k];
        if (factor === 0) continue;
        for (j = 0; j < 2 * n; j++) a[i][j] -= factor * a[k][j];
      }
    }

    var inv = new Array(n);
    for (i = 0; i < n; i++) {
      inv[i] = new Array(n);
      for (j = 0; j < n; j++) {
        var value = 0.5 * (a[i][j + n] + a[j][i + n]);
        if (!Number.isFinite(value)) return null;
        inv[i][j] = value;
      }
    }
    return inv;
  }

  function dop(sats, rec) {
    var n = sats && typeof sats.length === 'number' ? sats.length : 0;
    if (!sats || n < 4 || !finiteXyz(rec)) return { ok: false, n: n };

    var normal = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];

    for (var s = 0; s < n; s++) {
      var sat = sats[s];
      if (!finiteXyz(sat)) return { ok: false, n: n };

      var dx = sat.x - rec.x;
      var dy = sat.y - rec.y;
      var dz = sat.z - rec.z;
      var range = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(range) || range < 1e-9) return { ok: false, n: n };

      var row = [-dx / range, -dy / range, -dz / range, 1];
      for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
          normal[i][j] += row[i] * row[j];
        }
      }
    }

    var q = invert4(normal);
    if (!q) return { ok: false, n: n };

    var qxx = q[0][0];
    var qyy = q[1][1];
    var qzz = q[2][2];
    var qtt = q[3][3];
    if (!(qxx >= 0 && qyy >= 0 && qzz >= 0 && qtt >= 0)) {
      return { ok: false, n: n };
    }

    var pdop2 = qxx + qyy + qzz;
    var tdop2 = qtt;
    var gdop2 = pdop2 + tdop2;
    if (!Number.isFinite(pdop2) || !Number.isFinite(tdop2) ||
        !Number.isFinite(gdop2) || pdop2 < 0 || tdop2 < 0) {
      return { ok: false, n: n };
    }

    var geo = geodeticFromEcef(rec.x, rec.y, rec.z);
    if (!geo) return { ok: false, n: n };

    var lat = geo.latDeg * DEG;
    var lon = geo.lonDeg * DEG;
    var sinLat = Math.sin(lat);
    var cosLat = Math.cos(lat);
    var sinLon = Math.sin(lon);
    var cosLon = Math.cos(lon);

    var eHat = [-sinLon, cosLon, 0];
    var nHat = [-sinLat * cosLon, -sinLat * sinLon, cosLat];
    var uHat = [cosLat * cosLon, cosLat * sinLon, sinLat];

    function quadForm(v) {
      var a0 = v[0];
      var a1 = v[1];
      var a2 = v[2];
      return a0 * (q[0][0] * a0 + q[0][1] * a1 + q[0][2] * a2) +
        a1 * (q[1][0] * a0 + q[1][1] * a1 + q[1][2] * a2) +
        a2 * (q[2][0] * a0 + q[2][1] * a1 + q[2][2] * a2);
    }

    var hdop2 = quadForm(eHat) + quadForm(nHat);
    var vdop2 = quadForm(uHat);
    var tolerance = 1e-12 * Math.max(1, pdop2);
    if (hdop2 < -tolerance || vdop2 < -tolerance) {
      return { ok: false, n: n };
    }
    if (hdop2 < 0) hdop2 = 0;
    if (vdop2 < 0) vdop2 = 0;

    var hdop = Math.sqrt(hdop2);
    var vdop = Math.sqrt(vdop2);
    var pdop = Math.sqrt(pdop2);
    var tdop = Math.sqrt(tdop2);
    var gdop = Math.sqrt(gdop2);

    if (!Number.isFinite(hdop) || !Number.isFinite(vdop) ||
        !Number.isFinite(pdop) || !Number.isFinite(tdop) ||
        !Number.isFinite(gdop)) {
      return { ok: false, n: n };
    }

    return {
      ok: true,
      gdop: gdop,
      pdop: pdop,
      hdop: hdop,
      vdop: vdop,
      tdop: tdop,
      n: n
    };
  }

  GNSS.ecefFromGeodetic = ecefFromGeodetic;
  GNSS.geodeticFromEcef = geodeticFromEcef;
  GNSS.satEcef = satEcef;
  GNSS.allSats = allSats;
  GNSS.satVelocity = satVelocity;
  GNSS.lookAngles = lookAngles;
  GNSS.visible = visible;
  GNSS.dop = dop;
})();
