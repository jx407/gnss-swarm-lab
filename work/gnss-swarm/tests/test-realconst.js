'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-realconst.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/real-sat-elements.js', __dirname + '/../winners/ephemeris.js', target);
const D = Math.PI / 180, TAU = 2 * Math.PI;
const E = G.REAL_GPS_ELEMENTS || [];
const epochUnix = e => Date.parse(e.epoch + 'Z') / 1000;
const T0 = Math.max.apply(null, E.map(epochUnix));

/* 独立 oracle（v7 时间口径）。与契约同公式，但真近点角走 cos-nu/sin-nu 展开式，避免与实现同路径 */
function oracle(e, relSec, refUnix) {
  const t = (refUnix == null ? T0 : refUnix) + relSec;
  const dt = t - epochUnix(e);
  let M = e.m0Deg * D + e.nRadPerSec * dt;
  M = ((M % TAU) + TAU) % TAU;
  let E1 = M;
  for (let k = 0; k < 30; k++) { const d = (E1 - e.e * Math.sin(E1) - M) / (1 - e.e * Math.cos(E1)); E1 -= d; if (Math.abs(d) < 1e-12) break; }
  const den = 1 - e.e * Math.cos(E1);
  const cosNu = (Math.cos(E1) - e.e) / den, sinNu = Math.sqrt(1 - e.e * e.e) * Math.sin(E1) / den;
  const r = e.aM * den;
  const px = r * cosNu, py = r * sinNu;
  const w = e.argpDeg * D, inc = e.iDeg * D, raan = e.raanDeg * D;
  const x1 = px * Math.cos(w) - py * Math.sin(w), y1 = px * Math.sin(w) + py * Math.cos(w);
  const y2 = y1 * Math.cos(inc), z2 = y1 * Math.sin(inc);
  const x = x1 * Math.cos(raan) - y2 * Math.sin(raan), y = x1 * Math.sin(raan) + y2 * Math.cos(raan);
  const th = G.gmstFromUnix(t);
  return { x: x * Math.cos(th) + y * Math.sin(th), y: -x * Math.sin(th) + y * Math.cos(th), z: z2 };
}
function compare(relSec, refUnix, tol) {
  const sats = G.realConst(relSec, refUnix == null ? undefined : { refUnix });
  const by = {}; sats.forEach(s => { by[s.prn] = s; });
  let mx = 0, worst = '';
  for (const e of E) {
    const o = oracle(e, relSec, refUnix), s = by[e.prn];
    if (!s) { mx = Infinity; worst = 'PRN' + e.prn + ' missing'; break; }
    const d = Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z);
    if (d > mx) { mx = d; worst = 'PRN' + e.prn; }
  }
  const tag = 'relSec=' + H.fmt(relSec) + (refUnix == null ? ' default-T0' : ' refUnix=' + refUnix);
  H.check('独立 oracle 一致 (' + tag + ', tol ' + tol + ' m)', mx <= tol, 'max=' + (mx === Infinity ? 'Infinity' : mx.toExponential(2)) + ' m @' + worst);
  return mx;
}

H.section('接口与数据');
H.check('REAL_GPS_ELEMENTS 32 条', Array.isArray(G.REAL_GPS_ELEMENTS) && E.length === 32);
H.check('realConst 存在', typeof G.realConst === 'function');
if (typeof G.realConst !== 'function') H.summary();
H.check('realConst.T0 = 最新历元 (+-1 s)', Math.abs(G.realConst.T0 - T0) <= 1,
  'got ' + new Date(G.realConst.T0 * 1000).toISOString() + ' expect ' + new Date(T0 * 1000).toISOString());
const sats = G.realConst(0);
H.check('返回数组且 32 颗', Array.isArray(sats) && sats.length === 32, 'got ' + (sats && sats.length));
const prns = sats.map(s => s.prn);
H.check('PRN 唯一且为 1..32 整数', new Set(prns).size === 32 && prns.every(p => Number.isInteger(p) && p >= 1 && p <= 32), 'prns=' + prns.slice(0, 6).join(','));
H.check('都带 sys=G 与 norad', sats.every(s => s.sys === 'G' && Number.isFinite(s.norad)));

H.section('轨道一致性');
let aOk = true, rOk = true, perOk = true, latOk = true, worst = '';
const byPrn = {};
for (const s of sats) byPrn[s.prn] = s;
for (const e of E) {
  const s = byPrn[e.prn];
  if (!s) { aOk = false; continue; }
  if (Math.abs(s.aM - e.aM) > 1) { aOk = false; worst = 'a ' + e.prn; }
  const r = Math.hypot(s.x, s.y, s.z);
  if (r < e.aM * (1 - e.e) - 200 || r > e.aM * (1 + e.e) + 200) { rOk = false; worst = 'r ' + e.prn + ' ' + (r / 1000).toFixed(1) + ' km'; }
  const per = 2 * Math.PI / e.nRadPerSec;
  if (per < 43000 || per > 43200) perOk = false;
  const lat = G.geodeticFromEcef(s.x, s.y, s.z).latDeg;
  if (Math.abs(lat) > e.iDeg + 0.1) { latOk = false; worst = 'lat ' + e.prn + ' ' + lat.toFixed(2); }
}
H.check('半长轴与数据一致 (+-1 m)', aOk);
H.check('|r| 落在 a(1+-e) 内 (+-200 m)', rOk, worst);
H.check('周期 in [43000, 43200] s', perOk);
H.check('纬度受倾角限制 (<= i+0.1 deg)', latOk, worst);
const ages = E.map(e => Math.abs(T0 - epochUnix(e)) / 86400);
H.check('默认参考时刻下每颗外推龄 <= 20 天', Math.max.apply(null, ages) <= 20, 'max=' + Math.max.apply(null, ages).toFixed(2));
H.check('其中 >=28 颗外推龄 <= 2 天', ages.filter(x => x <= 2).length >= 28, 'n=' + ages.filter(x => x <= 2).length);

H.section('独立 oracle 比对（时间口径）');
compare(0, null, 1);
compare(3600.5, null, 1);
compare(-7200, null, 1);
compare(0, 0, 1);

H.section('GMST 独立自检');
H.check('gmstFromUnix 是函数', typeof G.gmstFromUnix === 'function');
if (typeof G.gmstFromUnix === 'function') {
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const thJ2000 = G.gmstFromUnix(946728000);
  H.approx('J2000 已知值 280.46061837 deg (+-1e-6 rad)', Math.abs(wrap(thJ2000 - 280.46061837 * D)), 0, 1e-6, 'rad');
  const sid = 86164.0905;
  let worstSid = 0;
  for (const t of [0, 946728000, 1.79e9]) worstSid = Math.max(worstSid, wrap(G.gmstFromUnix(t + sid) - G.gmstFromUnix(t)));
  H.check('恒星日后天球转角回到 0 (+-1e-4 rad)', worstSid < 1e-4, 'max=' + worstSid.toExponential(2) + ' rad');
}

H.section('真实几何（上海 31.2304N 121.4737E 50m 掩膜 10 deg）');
const rec = G.ecefFromGeodetic(31.2304, 121.4737, 50);
const elOf = v => (v.elDeg != null ? v.elDeg : v.elevationDeg);
const vis = G.visible(sats, rec, 10);
const d0 = vis.length >= 4 ? G.dop(vis, rec) : null;
H.check('T0 可见星 8-13 颗', vis.length >= 8 && vis.length <= 13, 'n=' + vis.length);
H.check('T0 PDOP <= 4', d0 && d0.ok && d0.pdop <= 4, d0 ? 'pdop=' + H.fmt(d0.pdop, 2) : 'n/a');
const maxEl = vis.length ? Math.max.apply(null, vis.map(elOf).filter(Number.isFinite)) : 0;
H.check('T0 最高仰角 >= 45 deg', maxEl >= 45, 'maxEl=' + H.fmt(maxEl, 1));
let minN = 99, maxPdop = 0, badH = '';
for (let h = 0; h < 24; h++) {
  const s1 = G.realConst(h * 3600);
  const v1 = G.visible(s1, rec, 10);
  const d1 = v1.length >= 4 ? G.dop(v1, rec) : null;
  minN = Math.min(minN, v1.length);
  if (d1 && d1.ok) { if (d1.pdop > maxPdop) { maxPdop = d1.pdop; badH = '+' + h + 'h'; } } else maxPdop = 99;
}
H.check('24h 内每小时可见 >= 6 颗', minN >= 6, 'min=' + minN);
H.check('24h 内每小时 PDOP <= 6', maxPdop <= 6, 'max=' + H.fmt(maxPdop, 2) + ' @' + badH);

H.section('惯性系周期性');
let perErr = 0, perWorst = '';
const rot = (p, th) => ({ x: p.x * Math.cos(th) - p.y * Math.sin(th), y: p.x * Math.sin(th) + p.y * Math.cos(th), z: p.z });
for (const e of E.slice(0, 8)) {
  const T = 2 * Math.PI / e.nRadPerSec;
  const a = G.realConst(0).find(s => s.prn === e.prn), b = G.realConst(T).find(s => s.prn === e.prn);
  if (!a || !b) continue;
  const ra = rot(a, G.gmstFromUnix(T0)), rb = rot(b, G.gmstFromUnix(T0 + T));
  const dd = Math.hypot(ra.x - rb.x, ra.y - rb.y, ra.z - rb.z);
  if (dd > perErr) { perErr = dd; perWorst = 'PRN' + e.prn; }
}
H.check('一个周期后惯性系位置重合 (< 5 km)', perErr < 5000, 'max=' + (perErr / 1000).toFixed(2) + ' km @' + perWorst);

H.section('健壮性与确定性');
let threw = false, bad = [], a1 = null, a2 = null;
const snapBefore = JSON.stringify(G.REAL_GPS_ELEMENTS);
try {
  bad = [G.realConst(NaN), G.realConst(Infinity), G.realConst(undefined), G.realConst('12'), G.realConst(null)];
  a1 = G.realConst(1234.5); a2 = G.realConst(1234.5);
} catch (err) { threw = true; }
H.check('非法输入不抛异常且都返回空', !threw && bad.every(b => Array.isArray(b) && b.length === 0), 'lens=' + bad.map(b => (b && b.length)).join(','));
H.check('两次调用逐位一致', !!(a1 && a2) && a1.every((s, i) => s.x === a2[i].x && s.y === a2[i].y && s.z === a2[i].z));
H.check('未修改根数常量', JSON.stringify(G.REAL_GPS_ELEMENTS) === snapBefore);
const optsObj = { refUnix: T0 };
const optsSnap = JSON.stringify(optsObj);
G.realConst(60, optsObj);
H.check('未修改传入 opts', JSON.stringify(optsObj) === optsSnap);
H.summary();
