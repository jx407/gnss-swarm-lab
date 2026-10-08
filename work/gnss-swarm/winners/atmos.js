/* ============================================================================
 * GNSS 大气延迟模块（变体 A）—— 电离层 Klobuchar + 对流层 Saastamoinen
 * 契约：CONTRACT.md §0 通用规则 + CONTRACT-v3.md §7。
 * 零依赖纯 JS（ES2018 以内）：无 import/require/DOM/外部依赖/Math.random，
 * 库文件内不 console.log；装载到 globalThis.GNSS（不覆盖已有字段），
 * 同一份文件可直接在浏览器 <script> 与 Node require 中运行。
 *
 * 电离层（IS-GPS-200 单频算法，薄壳高度 350 km；E 用半圆 = π rad = 180°）：
 *   ψ  = 0.0137/(E + 0.11) − 0.022                 穿刺点地心角
 *   φi = φu + ψ·cosA                              穿刺点纬度（限幅在 ±0.416 半圆内）
 *   λi = λu + ψ·sinA / cos(φi·π)                  穿刺点经度
 *   φm = φi + 0.064·cos((λi − 1.617)·π)           地磁纬度
 *   t  = 4.32e4·λi + tGpsSec                      地方时，按 86400 s 归一
 *   A  = Σ αn·φm^n（<0 取 0），P = Σ βn·φm^n（<72000 s 取 72000 s）
 *   x  = 2π(t − 50400)/P
 *   dτ = 5e-9 + A·(1 − x²/2 + x⁴/24)（|x| < 1.57），否则 dτ = 5e-9
 *   F  = 1 + 16·(0.53 − E)³（≥ 1）
 *   天顶延迟（m）= dτ·c·(f_L1/f)²，斜距延迟 = F·天顶延迟
 *   说明：φi 的 ±0.416 限幅是 IS-GPS-200 原文步骤，同时避免极区 cos(φi·π) → 0
 *         让 λi 发散（否则接收机纬度 → ±90° 会算出 NaN）。
 *
 * 对流层（Saastamoinen）：
 *   Zdry = 0.0022768·P / (1 − 0.00266·cos2φ − 0.00028·H)      P: hPa，H: km
 *   e    = RH·6.11·10^(7.5T'/(237.3+T'))                       T' = T − 273.15
 *   Zwet = 0.002277·(1255/T + 0.05)·e                          T: K
 *   斜距 = (Zdry + Zwet)·m(E)，默认 m(E) = 1/sinE（可选 'marini'）
 *
 * 非法输入（null / 非有限值 / fHz ≤ 0 / 气压 ≤ 0 / 仰角 ≤ 0° 等）返回
 *   { valid:false, reason, … }，不抛异常、不返回 NaN；数值字段一律给 0，
 *   几何可算时仍给出真实的 elevDeg/azimuthDeg（风格与 winners/multipath.js 的 blankResult 一致）。
 *   注：§7 第 1 条要求「P = 0 时干分量为 0」，第 39 行又把「P ≤ 0」列为非法输入：
 *       本实现按前者把 P = 0 判为 valid:false，同时把 dryM/zenithM/slantM 置 0，
 *       数值上满足「干分量为 0」，也避免出现 NaN。
 *
 * tGpsSec 直接当作接收时刻的 GPS 周内秒（教学简化：不另做信号传播时延 / 地球自转改正）。
 * ========================================================================= */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  /* ------------------------------- 常数 ------------------------------- */
  var C_LIGHT = 299792458;              /* 光速 m/s */
  var F_L1 = 1575.42e6;                 /* GPS L1 载波频率 Hz */
  var DEG = Math.PI / 180;
  var RAD = 180 / Math.PI;
  var TWO_PI = 2 * Math.PI;

  /* WGS-84 椭球 */
  var WGS84_A = 6378137;
  var WGS84_F = 1 / 298.257223563;
  var WGS84_E2 = WGS84_F * (2 - WGS84_F);
  var WGS84_B = WGS84_A * (1 - WGS84_F);
  var WGS84_EP2 = (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);

  /* Klobuchar / IS-GPS-200 单频算法 */
  var KLOB_NIGHT_S = 5e-9;              /* dτ 常数项 5 ns */
  var KLOB_PERIOD_MIN_S = 72000;        /* 周期下限 72000 s */
  var KLOB_X_LIMIT = 1.57;              /* |x| 阈值 */
  var KLOB_LOCAL_PEAK_S = 50400;        /* 地方时 14:00 = 50400 s */
  var KLOB_LAMBDA_TIME = 4.32e4;        /* t = 4.32e4·λi + tGps */
  var KLOB_PHI_LIMIT = 0.416;           /* 穿刺点纬度限幅（半圆） */
  var SECONDS_PER_DAY = 86400;

  /* 对流层 Saastamoinen 默认参数 */
  var SEA_LEVEL_PRESSURE_HPA = 1013.25;
  var DEFAULT_TEMP_C = 15;
  var DEFAULT_RH = 0.5;
  var DEFAULT_HEIGHT_M = 50;
  var DEFAULT_ALPHA = [1.1176e-8, 0, -5.9605e-8, 0];
  var DEFAULT_BETA = [8.8064e4, 0, -1.9661e5, 0];

  /* ------------------------------ 小工具 ------------------------------ */
  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function isObj(v) { return !!v && typeof v === 'object'; }
  function hasKey(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  function isXyz(p) { return isObj(p) && isNum(p.x) && isNum(p.y) && isNum(p.z); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* 选项读取：字段缺省 -> 默认值；给了非有限值 -> ok:false。 */
  function optNum(opts, key, def) {
    if (!hasKey(opts, key)) return { ok: true, value: def };
    var v = opts[key];
    return isNum(v) ? { ok: true, value: v } : { ok: false, value: def };
  }

  /* α / β 系数：必须是长度 ≥ 4 的有限数数组，否则 ok:false。 */
  function optCoef(opts, key, def) {
    if (!hasKey(opts, key)) return { ok: true, value: def.slice(0, 4) };
    var v = opts[key];
    if (!isObj(v) || !isNum(v.length) || v.length < 4) return { ok: false, value: def.slice(0, 4) };
    var out = [];
    for (var i = 0; i < 4; i++) {
      if (!isNum(v[i])) return { ok: false, value: def.slice(0, 4) };
      out.push(v[i]);
    }
    return { ok: true, value: out };
  }

  /* WGS-84 ECEF -> 大地坐标（Bowring 初值 + 定点迭代）。本模块自带，不依赖其它模块。 */
  function geodeticFromEcef(x, y, z) {
    var lon = Math.atan2(y, x);
    var p = Math.sqrt(x * x + y * y);
    var lat, h, sinLat, cosLat, N, i, latNew;

    if (p < 1e-12) {
      lat = z >= 0 ? Math.PI / 2 : -Math.PI / 2;
      return { latDeg: lat * RAD, lonDeg: lon * RAD, hM: Math.abs(z) - WGS84_B };
    }

    var theta = Math.atan2(z * WGS84_A, p * WGS84_B);
    var sinT = Math.sin(theta);
    var cosT = Math.cos(theta);
    lat = Math.atan2(z + WGS84_EP2 * WGS84_B * sinT * sinT * sinT,
                     p - WGS84_E2 * WGS84_A * cosT * cosT * cosT);

    for (i = 0; i < 15; i++) {
      sinLat = Math.sin(lat);
      cosLat = Math.cos(lat);
      N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
      latNew = Math.atan2(z + WGS84_E2 * N * sinLat, p);
      if (Math.abs(latNew - lat) < 1e-15) { lat = latNew; break; }
      lat = latNew;
    }

    sinLat = Math.sin(lat);
    cosLat = Math.cos(lat);
    N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    h = Math.abs(cosLat) >= Math.abs(sinLat) ? p / cosLat - N : z / sinLat - N * (1 - WGS84_E2);
    return { latDeg: lat * RAD, lonDeg: lon * RAD, hM: h };
  }

  /* 几何：rec / sat（ECEF 米）-> 接收机大地坐标 + 仰角 / 方位角（方位自北起顺时针）。 */
  function geometry(rec, sat) {
    if (!isXyz(rec) || !isXyz(sat)) return null;
    var geo = geodeticFromEcef(rec.x, rec.y, rec.z);
    if (!geo) return null;

    var dx = sat.x - rec.x;
    var dy = sat.y - rec.y;
    var dz = sat.z - rec.z;
    var rangeM = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(rangeM)) return null;
    if (rangeM === 0) {
      return { latDeg: geo.latDeg, lonDeg: geo.lonDeg, hM: geo.hM, elevDeg: 90, azDeg: 0, rangeM: 0 };
    }

    var lat = geo.latDeg * DEG;
    var lon = geo.lonDeg * DEG;
    var sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    var sinLon = Math.sin(lon), cosLon = Math.cos(lon);
    var east = -sinLon * dx + cosLon * dy;
    var north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
    var up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

    return {
      latDeg: geo.latDeg, lonDeg: geo.lonDeg, hM: geo.hM, rangeM: rangeM,
      elevDeg: Math.asin(clamp(up / rangeM, -1, 1)) * RAD,
      azDeg: (Math.atan2(east, north) * RAD + 360) % 360
    };
  }

  /* ---------------------------- 结果骨架 ---------------------------- */
  function baseResult(geo) {
    return {
      valid: false,
      reason: '',
      elevDeg: geo ? geo.elevDeg : null,
      azimuthDeg: geo ? geo.azDeg : null,
      zenithM: 0,
      slantM: 0,
      mapping: 0
    };
  }
  function fail(geo, reason) {
    var r = baseResult(geo);
    r.reason = reason;
    return r;
  }
  function tropoResult(geo) {
    var r = baseResult(geo);
    r.dryM = 0;
    r.wetM = 0;
    return r;
  }
  function tropoFail(geo, reason) {
    var r = tropoResult(geo);
    r.reason = reason;
    return r;
  }

  /* --------------------------- 电离层 Klobuchar --------------------------- */
  function ionoDelay(rec, sat, tGpsSec, opts) {
    var geo = geometry(rec, sat);
    if (!geo) return fail(null, 'rec/sat must be finite ECEF coordinates');
    if (!isNum(tGpsSec)) return fail(geo, 'tGpsSec must be a finite number');

    var fHzOpt = optNum(opts, 'fHz', F_L1);
    if (!fHzOpt.ok) return fail(geo, 'fHz must be a finite number');
    if (!(fHzOpt.value > 0)) return fail(geo, 'fHz must be > 0');
    var alphaOpt = optCoef(opts, 'alpha', DEFAULT_ALPHA);
    if (!alphaOpt.ok) return fail(geo, 'alpha must be an array of >=4 finite numbers');
    var betaOpt = optCoef(opts, 'beta', DEFAULT_BETA);
    if (!betaOpt.ok) return fail(geo, 'beta must be an array of >=4 finite numbers');
    if (!(geo.elevDeg > 0)) return fail(geo, 'elevation must be > 0 deg');

    /* --- IS-GPS-200 单频算法（角度用半圆：1 半圆 = π rad） --- */
    var E = geo.elevDeg * DEG / Math.PI;          /* 仰角（半圆） */
    var az = geo.azDeg * DEG;                     /* 方位角（rad） */
    var psi = 0.0137 / (E + 0.11) - 0.022;        /* 穿刺点地心角（半圆） */
    var phiU = geo.latDeg / 180;                  /* 接收机纬度（半圆） */
    var lamU = geo.lonDeg / 180;                  /* 接收机经度（半圆） */
    var phiI = clamp(phiU + psi * Math.cos(az), -KLOB_PHI_LIMIT, KLOB_PHI_LIMIT);
    var lamI = lamU + psi * Math.sin(az) / Math.cos(phiI * Math.PI);
    var phiM = phiI + 0.064 * Math.cos((lamI - 1.617) * Math.PI);

    /* 振幅 A = Σ αn·φm^n（负值取 0）与周期 P = Σ βn·φm^n（下限 72000 s） */
    var al = alphaOpt.value;
    var be = betaOpt.value;
    var amp = al[0] + phiM * (al[1] + phiM * (al[2] + phiM * al[3]));
    if (!(amp > 0)) amp = 0;
    var period = be[0] + phiM * (be[1] + phiM * (be[2] + phiM * be[3]));
    if (!(period >= KLOB_PERIOD_MIN_S)) period = KLOB_PERIOD_MIN_S;

    /* 地方时（按 86400 s 归一） */
    var tLocal = KLOB_LAMBDA_TIME * lamI + tGpsSec;
    tLocal = tLocal - SECONDS_PER_DAY * Math.floor(tLocal / SECONDS_PER_DAY);

    var x = TWO_PI * (tLocal - KLOB_LOCAL_PEAK_S) / period;
    var dTau;
    if (Math.abs(x) < KLOB_X_LIMIT) {
      dTau = KLOB_NIGHT_S + amp * (1 - x * x / 2 + x * x * x * x / 24);
    } else {
      dTau = KLOB_NIGHT_S;
    }

    /* 斜距（obliquity）因子 F（E 为半圆），理论上 ≥ 1 */
    var F = 1 + 16 * Math.pow(0.53 - E, 3);
    if (!(F >= 1)) F = 1;

    var zenithM = dTau * C_LIGHT * Math.pow(F_L1 / fHzOpt.value, 2);

    var out = baseResult(geo);
    out.valid = true;
    out.reason = null;
    out.zenithM = zenithM;
    out.mapping = F;
    out.slantM = zenithM * F;
    return out;
  }

  /* ------------------------- 对流层 Saastamoinen ------------------------- */
  /* 映射函数：默认 1/sinE；'marini' 为经典连续分式形式（契约允许，默认不用）。 */
  function mappingFactor(mode, elRad) {
    var sinE = Math.sin(elRad);
    if (mode === 'marini') {
      var tanE = Math.tan(elRad);
      var a = 0.00143 / (tanE + 0.0445);
      var b = 0.00035 / (tanE + 0.017);
      var c = 0.017;
      return 1 / (sinE + a / (sinE + b / (sinE + c)));
    }
    return 1 / sinE;
  }

  function tropoDelay(rec, sat, opts) {
    var geo = geometry(rec, sat);
    if (!geo) return tropoFail(null, 'rec/sat must be finite ECEF coordinates');

    var pOpt = optNum(opts, 'pressureHpa', SEA_LEVEL_PRESSURE_HPA);
    if (!pOpt.ok) return tropoFail(geo, 'pressureHpa must be a finite number');
    if (!(pOpt.value > 0)) return tropoFail(geo, 'pressureHpa must be > 0 (P = 0 gives dry = 0)');
    var tOpt = optNum(opts, 'tempC', DEFAULT_TEMP_C);
    if (!tOpt.ok) return tropoFail(geo, 'tempC must be a finite number');
    var rhOpt = optNum(opts, 'relHumidity', DEFAULT_RH);
    if (!rhOpt.ok) return tropoFail(geo, 'relHumidity must be a finite number');
    if (rhOpt.value < 0 || rhOpt.value > 1) return tropoFail(geo, 'relHumidity must be within [0, 1]');
    var hOpt = optNum(opts, 'heightM', DEFAULT_HEIGHT_M);
    if (!hOpt.ok) return tropoFail(geo, 'heightM must be a finite number');
    if (!(geo.elevDeg > 0)) return tropoFail(geo, 'elevation must be > 0 deg');

    var mode = '1/sin';
    if (hasKey(opts, 'mapMode')) {
      if (typeof opts.mapMode !== 'string') return tropoFail(geo, 'mapMode must be a string');
      mode = opts.mapMode;
      if (mode !== '1/sin' && mode !== 'marini') return tropoFail(geo, "mapMode must be '1/sin' or 'marini'");
    }

    /* 天顶干分量：P [hPa]，H [km]，φ 为接收机大地纬度 */
    var P = pOpt.value;
    var heightKm = hOpt.value / 1000;
    var cos2phi = Math.cos(2 * geo.latDeg * DEG);
    var dryM = 0.0022768 * P / (1 - 0.00266 * cos2phi - 0.00028 * heightKm);

    /* 天顶湿分量：e = RH·6.11·10^(7.5T'/(237.3+T'))，T 为绝对温度 [K] */
    var tempC = tOpt.value;
    var tempK = tempC + 273.15;
    var e = rhOpt.value * 6.11 * Math.pow(10, 7.5 * tempC / (237.3 + tempC));
    var wetM = 0.002277 * (1255 / tempK + 0.05) * e;

    var map = mappingFactor(mode, geo.elevDeg * DEG);

    var out = tropoResult(geo);
    out.valid = true;
    out.reason = null;
    out.dryM = dryM;
    out.wetM = wetM;
    out.zenithM = dryM + wetM;
    out.mapping = map;
    out.slantM = out.zenithM * map;
    return out;
  }

  /* ------------------------------ 合成 ------------------------------ */
  function atmosDelay(rec, sat, tGpsSec, opts) {
    var io = ionoDelay(rec, sat, tGpsSec, opts);
    var tr = tropoDelay(rec, sat, opts);
    var fq = optNum(opts, 'fHz', F_L1);
    var fHz = (fq.ok && fq.value > 0) ? fq.value : 0;

    var ang = null;
    if (isNum(io.elevDeg)) ang = io;
    else if (isNum(tr.elevDeg)) ang = tr;

    var out = {
      valid: false,
      reason: '',
      elevDeg: ang ? ang.elevDeg : null,
      azimuthDeg: ang ? ang.azimuthDeg : null,
      zenithM: 0,
      slantM: 0,
      mapping: 0,
      ionoM: 0,
      tropoM: 0,
      totalM: 0,
      fHz: fHz
    };

    if (!io.valid) { out.reason = 'iono: ' + io.reason; return out; }
    if (!tr.valid) { out.reason = 'tropo: ' + tr.reason; return out; }

    out.valid = true;
    out.reason = null;
    out.ionoM = io.slantM;
    out.tropoM = tr.slantM;
    out.totalM = io.slantM + tr.slantM;
    out.slantM = io.slantM + tr.slantM;      /* 合成结果里 slantM 即总斜距延迟 */
    out.zenithM = io.zenithM + tr.zenithM;   /* 天顶方向上的电离层 + 对流层 */
    out.mapping = out.zenithM > 0 ? out.slantM / out.zenithM : 0;  /* 等效斜距因子 */
    return out;
  }

  GNSS.ionoDelay = ionoDelay;
  GNSS.tropoDelay = tropoDelay;
  GNSS.atmosDelay = atmosDelay;
})();
