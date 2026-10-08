'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-atmos.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ephemeris.js', target);
const C = G.CONST;

const LAT = 31.2304, LON = 121.4737, H0 = 50;
const rec = G.ecefFromGeodetic(LAT, LON, H0);
const R = 22000000;
function dir(azDeg, elDeg) {
  const la = LAT * Math.PI / 180, lo = LON * Math.PI / 180, az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  const e = Math.cos(el) * Math.sin(az), n = Math.cos(el) * Math.cos(az), up = Math.sin(el);
  return {
    dx: -Math.sin(lo) * e - Math.sin(la) * Math.cos(lo) * n + Math.cos(la) * Math.cos(lo) * up,
    dy: Math.cos(lo) * e - Math.sin(la) * Math.sin(lo) * n + Math.cos(la) * Math.sin(lo) * up,
    dz: Math.cos(la) * n + Math.sin(la) * up
  };
}
function satAt(az, el) { const d = dir(az, el); return { x: rec.x + d.dx * R, y: rec.y + d.dy * R, z: rec.z + d.dz * R }; }

H.section('接口');
for (const f of ['ionoDelay', 'tropoDelay', 'atmosDelay']) H.check('存在 ' + f, typeof G[f] === 'function');
if (typeof G.ionoDelay !== 'function' || typeof G.tropoDelay !== 'function' || typeof G.atmosDelay !== 'function') {
  H.check('三个大气函数必须齐备', false, '缺函数，后续判据无法评估');
  H.summary();
}

H.section('对流层（Saastamoinen）');
const zen = G.tropoDelay(rec, satAt(180, 90), { heightM: H0 });
H.check('90° 仰角返回 valid', zen && zen.valid === true, zen && zen.reason);
H.approx('天顶干分量 ≈ 2.3 m', zen.dryM == null ? zen.zenithM : zen.dryM, 2.30, 0.05, 'm');
if (zen.dryM != null) H.check('天顶湿分量在 15 ℃ / 50% RH 落在 [0, 0.6] m', zen.wetM >= 0 && zen.wetM <= 0.6, 'wet=' + H.fmt(zen.wetM, 3));
const dry0 = G.tropoDelay(rec, satAt(180, 90), { pressureHpa: 0, relHumidity: 0, heightM: H0 });
H.check('P=0 且 RH=0 时天顶延迟为 0', Math.abs((dry0.slantM || dry0.zenithM)) < 1e-6, 'got ' + H.fmt(dry0.slantM || dry0.zenithM, 6));
const rh0 = G.tropoDelay(rec, satAt(180, 90), { relHumidity: 0, heightM: H0 });
const rh9 = G.tropoDelay(rec, satAt(180, 90), { relHumidity: 0.9, heightM: H0 });
H.check('湿分量随相对湿度单调增', rh9.zenithM > rh0.zenithM + 1e-4, 'RH0=' + H.fmt(rh0.zenithM, 4) + ' RH0.9=' + H.fmt(rh9.zenithM, 4));
let mono = true, prev = -1, worstRatio = 0;
for (const el of [90, 60, 30, 15, 10, 5]) {
  const t = G.tropoDelay(rec, satAt(120, el), { heightM: H0 });
  if (!t.valid || t.slantM < prev - 1e-9) mono = false;
  prev = t.slantM;
  const expect = t.zenithM / Math.sin(el * Math.PI / 180);
  worstRatio = Math.max(worstRatio, Math.abs(t.slantM / expect - 1));
}
H.check('斜距随仰角降低单调增', mono);
H.check('斜距/天顶 = 1/sinE（相对误差 <1e-9）', worstRatio < 1e-9, 'max rel=' + worstRatio.toExponential(2));
const t10 = G.tropoDelay(rec, satAt(120, 10), { heightM: H0 });
H.check('10° 仰角斜距在合理区间 [8, 40] m', t10.slantM > 8 && t10.slantM < 40, 'slant=' + H.fmt(t10.slantM, 2) + ' m');

H.section('电离层（Klobuchar）');
const t0 = 12 * 3600;
const zIono = G.ionoDelay(rec, satAt(180, 90), t0, {});
H.check('90° 仰角返回 valid', zIono && zIono.valid === true, zIono && zIono.reason);
H.check('天顶延迟落在 [0.5, 40] m', zIono.slantM > 0.5 && zIono.slantM < 40, 'zenith=' + H.fmt(zIono.slantM, 3) + ' m');
let iMono = true, prevI = -1, ratioMax = 0;
for (const el of [90, 60, 30, 15, 10]) {
  const v = G.ionoDelay(rec, satAt(120, el), t0, {});
  if (!v.valid || v.slantM < prevI - 1e-9) iMono = false;
  prevI = v.slantM;
  if (el === 10) ratioMax = v.slantM / zIono.slantM;
}
H.check('斜距随仰角降低单调增', iMono);
H.check('10° 仰角斜距 ≤ 4× 天顶', ratioMax <= 4, 'ratio=' + H.fmt(ratioMax, 2));
const l1 = G.ionoDelay(rec, satAt(120, 30), t0, { fHz: C.F_L1 });
const l2 = G.ionoDelay(rec, satAt(120, 30), t0, { fHz: 1227.60e6 });
const scale = Math.pow(C.F_L1 / 1227.60e6, 2);
H.approx('L2 电离层延迟 = (f1/f2)² × L1（相对误差 <1e-6）', l2.slantM / l1.slantM, scale, 1e-6 * scale, '×');

H.section('atmosDelay 合成');
let sumOk = true, badSum = '';
for (const el of [90, 45, 20, 5]) {
  const s = satAt(200, el);
  const a = G.atmosDelay(rec, s, 6 * 3600, { heightM: H0 });
  const i = G.ionoDelay(rec, s, 6 * 3600, {});
  const t = G.tropoDelay(rec, s, { heightM: H0 });
  if (!a.valid || Math.abs(a.ionoM - i.slantM) > 1e-9 * Math.max(1, i.slantM) || Math.abs(a.tropoM - t.slantM) > 1e-9 * Math.max(1, t.slantM) || Math.abs(a.totalM - (i.slantM + t.slantM)) > 1e-9 * Math.max(1, i.slantM + t.slantM)) { sumOk = false; badSum = 'el=' + el; }
}
H.check('totalM = 电离层 + 对流层（1e-9 相对）', sumOk, badSum);
const a5 = G.atmosDelay(rec, satAt(200, 5), 6 * 3600, { heightM: H0 });
const a90 = G.atmosDelay(rec, satAt(200, 90), 6 * 3600, { heightM: H0 });
H.check('5° 仰角总延迟 ≤ 120 m', a5.totalM > 0 && a5.totalM <= 120, 'total=' + H.fmt(a5.totalM, 2) + ' m');
H.check('90° 仰角总延迟 ≤ 20 m', a90.totalM > 0 && a90.totalM <= 20, 'total=' + H.fmt(a90.totalM, 2) + ' m');
H.check('低频仰角延迟显著大于天顶（>2×）', a5.totalM > 2 * a90.totalM, '5°=' + H.fmt(a5.totalM, 2) + ' 90°=' + H.fmt(a90.totalM, 2));

H.section('健壮性与确定性');
let threw = false, bad = null;
try { bad = G.ionoDelay(null, satAt(120, 30), 0, {}); } catch (e) { threw = true; }
H.check('rec=null 不抛异常且 valid=false', !threw && bad && bad.valid === false, bad && bad.reason);
const badOpts = G.tropoDelay(rec, satAt(120, 30), { pressureHpa: -5, heightM: H0 });
H.check('负气压返回 valid=false', badOpts && badOpts.valid === false, badOpts && badOpts.reason);
const below = G.tropoDelay(rec, satAt(120, -5), { heightM: H0 });
H.check('仰角 < 0° 返回 valid=false', below && below.valid === false, below && below.reason);
const before = JSON.stringify({ rec: rec, alpha: [1.1176e-8, 0, -5.9605e-8, 0] });
const s1 = satAt(150, 25), o1 = { alpha: [1.1176e-8, 0, -5.9605e-8, 0], beta: [8.8064e4, 0, -1.9661e5, 0], heightM: H0 };
const r1 = G.atmosDelay(rec, s1, 30000, o1), r2 = G.atmosDelay(rec, s1, 30000, o1);
H.check('两次调用逐位一致', r1.totalM === r2.totalM && r1.ionoM === r2.ionoM);
H.check('未修改入参', JSON.stringify({ rec: rec, alpha: [1.1176e-8, 0, -5.9605e-8, 0] }) === before && JSON.stringify(o1.alpha) === JSON.stringify([1.1176e-8, 0, -5.9605e-8, 0]));
H.summary();
