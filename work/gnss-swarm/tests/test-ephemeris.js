'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-ephemeris.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', target);
const C = G.CONST, A = C.A_GPS, MU = C.mu, OE = C.OMEGA_E;

H.section('WGS-84 坐标互逆');
const pts = [[39.9075, 116.3972, 44], [-33.8688, 151.2093, 12], [0, 0, 0], [89.5, -170, 3000], [-70.25, 45.5, 150]];
let maxLat = 0, maxH = 0;
for (const [lat, lon, h] of pts) {
  const p = G.ecefFromGeodetic(lat, lon, h);
  const b = G.geodeticFromEcef(p.x, p.y, p.z);
  maxLat = Math.max(maxLat, Math.abs(b.latDeg - lat), Math.abs(b.lonDeg - lon));
  maxH = Math.max(maxH, Math.abs(b.hM - h));
}
H.check('经纬度闭环误差 < 1e-6 度', maxLat < 1e-6, 'max=' + maxLat.toExponential(2));
H.check('高程闭环误差 < 1e-3 m', maxH < 1e-3, 'max=' + maxH.toExponential(2));

H.section('轨道几何');
let rOk = true, rMin = Infinity, rMax = 0, latMax = 0, finite = true;
for (let prn = 1; prn <= 24; prn++) {
  for (const t of [0, 137.5, 4321, 30000, -999.25, 86400]) {
    const s = G.satEcef(prn, t);
    if (![s.x, s.y, s.z].every(Number.isFinite)) { finite = false; continue; }
    const r = Math.hypot(s.x, s.y, s.z);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    if (Math.abs(r - A) > 5) rOk = false;
    const la = G.geodeticFromEcef(s.x, s.y, s.z).latDeg;
    latMax = Math.max(latMax, Math.abs(la));
  }
}
H.check('卫星位置全部为有限值', finite);
H.check('地心距恒等于半长轴 ±5 m（圆轨道）', rOk, 'r=' + (rMin / 1000).toFixed(3) + '..' + (rMax / 1000).toFixed(3) + ' km');
H.check('纬度幅值 ≤ 55.1°（倾角 55°）', latMax <= 55.1 + 1e-6, 'max=' + latMax.toFixed(4) + '°');

/* 绝对定向 oracle：契约完全确定了 PRN -> (轨道面 k, 面内相位 j) 与坐标旋转，
 * 这里用测试自带的独立解析实现逐颗核对。它能抓出「不变量全对、但整体错位/错映射」的实现错误
 * （实测确实抓到过：某变体在 PRN20 上差了 4.6e7 m，而所有不变量判据都通过）。 */
function oracleEcef(prn, t) {
  const inc = 55 * Math.PI / 180;
  const k = Math.floor((prn - 1) / 4), j = (prn - 1) % 4;
  const raan = 60 * k * Math.PI / 180 - C.OMEGA_E * t;
  const u = (90 * j + 30 * k + 1.5 * (prn % 4)) * Math.PI / 180 + Math.sqrt(MU / (A * A * A)) * t;
  const px = A * Math.cos(u), py = A * Math.sin(u);
  return {
    x: px * Math.cos(raan) - py * Math.sin(raan) * Math.cos(inc),
    y: px * Math.sin(raan) + py * Math.cos(raan) * Math.cos(inc),
    z: py * Math.sin(inc)
  };
}
let orMax = 0, orWorst = '';
for (let p = 1; p <= 24; p++) {
  for (const t of [0, 6000, 43210.5, 86164.09]) {
    const o = oracleEcef(p, t), s = G.satEcef(p, t);
    const d = Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z);
    if (d > orMax) { orMax = d; orWorst = 'prn=' + p + ' t=' + t; }
  }
}
H.check('逐颗卫星位置与契约解析式一致（绝对定向 ≤ 2 km，24 颗全覆盖）', orMax <= 2000, 'max=' + Math.round(orMax) + ' m @' + orWorst);

/* 卫星不得重合（独立复核发现的缺陷：u=90j+30k 时 Δk=3、Δj=1 的对会在过交点瞬间严格重合，
 * t=0 实测 PRN1/PRN14 距离 0.000 m，可见星数与 DOP 统计都会因此失真）。 */
const Tsep = 2 * Math.PI / Math.sqrt(MU / (A * A * A));
let sepMin = Infinity, sepWorst = '';
for (let step2 = 0; step2 < 120; step2++) {
  const t2 = step2 * (Tsep / 120);
  const ss = G.allSats(t2);
  for (let a2 = 0; a2 < ss.length; a2++) for (let b2 = a2 + 1; b2 < ss.length; b2++) {
    const d2 = Math.hypot(ss[a2].x - ss[b2].x, ss[a2].y - ss[b2].y, ss[a2].z - ss[b2].z);
    if (d2 < sepMin) { sepMin = d2; sepWorst = 'PRN' + ss[a2].prn + '/PRN' + ss[b2].prn + ' t=' + (t2 / 3600).toFixed(2) + 'h'; }
  }
}
H.check('全轨道周期内任意两颗卫星不重合（最小间距 > 100 km）', sepMin > 100e3, 'min=' + (sepMin / 1000).toFixed(1) + ' km @' + sepWorst);
const v = G.satVelocity ? G.satVelocity(5, 1234.5) : null;
if (v) {
  const pa = G.satEcef(5, 1234.45), pb = G.satEcef(5, 1234.55);
  const num = { x: (pb.x - pa.x) / 0.1, y: (pb.y - pa.y) / 0.1, z: (pb.z - pa.z) / 0.1 };
  const speed = Math.hypot(v.x, v.y, v.z);
  const dv = Math.hypot(num.x - v.x, num.y - v.y, num.z - v.z);
  H.approx('satVelocity 与 satEcef 数值微分自洽', dv, 0, 1, 'm/s');
  H.check('ECEF 速度量级落在 1.5–6.0 km/s（含地球自转项）', speed > 1500 && speed < 6000, 'speed=' + speed.toFixed(1) + ' m/s（忽略自转才会恒为 3873.8）');
}
const T = 2 * Math.PI / Math.sqrt(MU / (A * A * A));
let repErr = 0;
for (const prn of [1, 9, 17, 24]) {
  const p0 = G.satEcef(prn, 0), p1 = G.satEcef(prn, 86164.09);
  repErr = Math.max(repErr, Math.hypot(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z));
}
H.check('恒星日 86164.09 s 后地固位置重复（< 3 km）', repErr < 3000, 'max=' + Math.round(repErr) + ' m; T_orbit=' + T.toFixed(2) + ' s, 2T=' + (2 * T).toFixed(2) + ' s');

/* 决定性物理判据：升交点经度必须按地球自转率西漂。
 * 取 u≈180°（降交点）到 u≈360°（升交点）之间约 T/2，经度应变化 ≈ -Omega_e*dt ≈ -90°。
 * 若实现漏掉 -Omega_e·t（把节点当地固系固定），该值会 ≈ 0°，本项即失败。 */
/* 决定性物理判据：ECEF 位置反旋 Ωe·t 回到惯性系后，必须以轨道周期 T 周期化。
 * 正确实现（RAAN_eff = RAAN - Ωe·t）反旋后残差 ≈ 0；漏掉地球自转项（把节点固定在地固系）
 * 会残留约 2|r| ≈ 5.3e7 m。该判据与相位布局、常数偏置无关，也不受 ±180° 环绕影响。 */
function eciFromEcef(prn, t) {
  const s = G.satEcef(prn, t), a = C.OMEGA_E * t, ca = Math.cos(a), sa = Math.sin(a);
  return { x: s.x * ca - s.y * sa, y: s.x * sa + s.y * ca, z: s.z };
}
let eciErr = 0, eciWorst = 0;
for (const tt of [0, 1234.5, 40000, 70000]) {
  const p = eciFromEcef(9, tt), q = eciFromEcef(9, tt + T);
  const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  if (d > eciErr) { eciErr = d; eciWorst = tt; }
}
H.check('ECEF 反旋 Ωe·t 后以轨道周期 T 周期化（决定性物理判据）', eciErr < 5000,
  'max residual = ' + Math.round(eciErr) + ' m @t=' + eciWorst + '（漏掉 -Ωe·t 项会残留 ~5.3e7 m）');

H.section('视线角 lookAngles');
const rec = G.ecefFromGeodetic(31.23, 121.47, 20);
let angOk = true, worst = 0;
for (const prn of [1, 2, 7, 13, 18, 24]) {
  const s = G.satEcef(prn, 22222);
  const la = G.lookAngles(rec, s);
  const lat = 31.23 * Math.PI / 180, lon = 121.47 * Math.PI / 180;
  const dx = s.x - rec.x, dy = s.y - rec.y, dz = s.z - rec.z;
  const E = -Math.sin(lon) * dx + Math.cos(lon) * dy;
  const N = -Math.sin(lat) * Math.cos(lon) * dx - Math.sin(lat) * Math.sin(lon) * dy + Math.cos(lat) * dz;
  const U = Math.cos(lat) * Math.cos(lon) * dx + Math.cos(lat) * Math.sin(lon) * dy + Math.sin(lat) * dz;
  const range = Math.hypot(dx, dy, dz);
  const el = Math.asin(U / range) * 180 / Math.PI;
  const az = (Math.atan2(E, N) * 180 / Math.PI + 360) % 360;
  const e1 = Math.abs(la.elDeg - el);
  const e2 = Math.min(Math.abs(la.azDeg - az), 360 - Math.abs(la.azDeg - az));
  worst = Math.max(worst, e1, e2);
  if (e1 > 1e-6 || e2 > 1e-6 || Math.abs(la.rangeM - range) > 1e-6) angOk = false;
}
H.check('方位/俯仰/距离与独立 ENU 计算一致（<1e-6）', angOk, 'max err=' + worst.toExponential(2));

H.section('可见性与 DOP');
const sats = G.allSats(12345);
H.check('allSats 返回 24 颗', Array.isArray(sats) && sats.length === 24 && sats.every(s => Number.isFinite(s.x)));
let mono = true, prev = 1e9;
for (const mask of [0, 5, 10, 20, 30, 40, 60]) {
  const vis = G.visible(sats, rec, mask);
  if (vis.length > prev) mono = false;
  prev = vis.length;
  if (!vis.every((s, i) => i === 0 || vis[i - 1].elDeg >= s.elDeg)) mono = false;
  if (!vis.every(s => s.elDeg >= mask - 1e-9)) mono = false;
}
H.check('可见数随仰角掩膜单调不增、按仰角降序、全部满足掩膜', mono);
const vis10 = G.visible(sats, rec, 10);
const d = G.dop(vis10, rec);
H.check('可见 6 星以上时 DOP 有效', vis10.length >= 6 && d.ok === true, 'n=' + vis10.length);
const rel = (x, y) => Math.abs(x - y) / Math.max(1e-12, Math.abs(x) + Math.abs(y));
H.check('HDOP² + VDOP² = PDOP²', rel(Math.hypot(d.hdop, d.vdop), d.pdop) < 1e-6, 'sqrt(h²+v²)=' + H.fmt(Math.hypot(d.hdop, d.vdop)) + ' pdop=' + H.fmt(d.pdop));
H.check('GDOP² = PDOP² + TDOP²', rel(Math.hypot(d.pdop, d.tdop), d.gdop) < 1e-6, 'pdop=' + H.fmt(d.pdop) + ' tdop=' + H.fmt(d.tdop) + ' gdop=' + H.fmt(d.gdop));
H.check('PDOP 落在合理区间 (0.5, 6)', d.pdop > 0.5 && d.pdop < 6, 'pdop=' + H.fmt(d.pdop));
H.check('全部 24 颗可见时 PDOP < 3', (() => { const dd = G.dop(G.visible(sats, rec, -90), rec); return dd.ok && dd.pdop < 3; })(), 'pdop=' + H.fmt(G.dop(G.visible(sats, rec, -90), rec).pdop));
const same = [0, 1, 2, 3].map(i => { const s = G.satEcef(1, 1000 + i); const p = G.ecefFromGeodetic(10, 20, 0); return { prn: 1, x: p.x + (s.x - p.x) * 1e-9 + i, y: p.y + (s.y - p.y) * 1e-9, z: p.z + (s.z - p.z) * 1e-9 }; });
const dg = G.dop(same, G.ecefFromGeodetic(10, 20, 0));
H.check('退化几何返回 ok:false 且无 NaN', dg.ok === false && !Number.isFinite(dg.pdop), 'ok=' + dg.ok + ' pdop=' + dg.pdop);
H.summary();
