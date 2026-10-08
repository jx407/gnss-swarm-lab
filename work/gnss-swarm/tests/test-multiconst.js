'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-multiconst.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ephemeris.js', target);

H.section('接口与元数据');
H.check('multiconst 存在', typeof G.multiconst === 'function');
H.check('MULTI_SYS 元数据齐备（G/E/C）', G.MULTI_SYS && G.MULTI_SYS.G && G.MULTI_SYS.E && G.MULTI_SYS.C);
if (typeof G.multiconst !== 'function') { H.summary(); }
const A_KM = { G: 26561.75e3, E: 29599.8e3, C: 27906.1e3 };
const INC = { G: 55, E: 56, C: 55 };
if (G.MULTI_SYS) {
  for (const s of ['G', 'E', 'C']) {
    const m = G.MULTI_SYS[s];
    H.check(s + ' 系统半长轴 ≈ ' + (A_KM[s] / 1000) + ' km', Math.abs((m.aM || m.a || 0) - A_KM[s]) < 1, 'a=' + ((m.aM || m.a) / 1000).toFixed(1) + ' km');
    H.check(s + ' 系统倾角 ≈ ' + INC[s] + '°', Math.abs((m.iDeg || m.i || 0) - INC[s]) < 0.5, 'i=' + (m.iDeg || m.i));
  }
}

H.section('向后兼容：GPS 单系统必须与既有星座逐位一致');
const t0 = 7777.5;
const gps = G.allSats(t0);
const mc = G.multiconst(t0, ['G']);
H.check('数量 = 24', mc.length === 24, 'got ' + mc.length);
let maxDiff = 0;
for (let i = 0; i < Math.min(24, mc.length); i++) {
  const a = gps[i], b = mc[i];
  if (!a || !b) { maxDiff = Infinity; break; }
  maxDiff = Math.max(maxDiff, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
}
/* 1 µm：两条等价但不同的旋转实现会有 ~1e-8 m 的浮点差；再紧就变成比浮点写法而不是比几何。 */
H.check('位置与 allSats 一致（≤1e-6 m）', maxDiff <= 1e-6, 'max=' + maxDiff.toExponential(2) + ' m');

H.section('三系统结构与轨道参数');
const all = G.multiconst(t0, ['G', 'E', 'C']);
H.check('合计 72 颗', all.length === 72, 'got ' + all.length);
const byS = { G: [], E: [], C: [] };
for (const s of all) { if (byS[s.sys]) byS[s.sys].push(s); }
H.check('每系统 24 颗', byS.G.length === 24 && byS.E.length === 24 && byS.C.length === 24, 'G=' + byS.G.length + ' E=' + byS.E.length + ' C=' + byS.C.length);
const labels = new Set(all.map(s => s.prn));
H.check('prn 标签唯一且有前缀', labels.size === all.length && all.every(s => typeof s.prn === 'string' && s.prn[0] === s.sys), 'unique=' + labels.size);
let radOk = true, latOk = true, radWorst = '';
for (const s of all) {
  const r = Math.hypot(s.x, s.y, s.z);
  if (Math.abs(r - A_KM[s.sys]) > 1) { radOk = false; radWorst = s.prn + ' r=' + (r / 1000).toFixed(3) + ' km'; }
  const la = G.geodeticFromEcef(s.x, s.y, s.z).latDeg;
  if (Math.abs(la) > INC[s.sys] + 0.01) latOk = false;
}
H.check('各地心距 = 该系统半长轴（±1 m）', radOk, radWorst);
H.check('纬度幅值 ≤ 该倾角', latOk);

H.section('刚体性与不重合');
/* 刚体性只对"同一轨道面内"的两颗成立：不同轨道面的相对距离本来就随时间变（早期版本写成任意两颗，是错的）。 */
let rigidMax = 0, rigidWorst = '', planePairs = 0;
const PER = { G: 4, E: 8, C: 8 };
for (const sys of ['G', 'E', 'C']) {
  const s0 = G.multiconst(0, [sys]);
  for (let i = 0; i < s0.length; i++) for (let j = i + 1; j < s0.length; j++) {
    if (Math.floor(s0[i].svn / PER[sys]) !== Math.floor(s0[j].svn / PER[sys])) continue;
    planePairs++;
    for (let step = 0; step < 8; step++) {
      const t = step * (43200 / 8);
      const ss = G.multiconst(t, [sys]);
      const d0 = Math.hypot(ss[i].x - ss[j].x, ss[i].y - ss[j].y, ss[i].z - ss[j].z);
      const d1 = Math.hypot(s0[i].x - s0[j].x, s0[i].y - s0[j].y, s0[i].z - s0[j].z);
      if (Math.abs(d0 - d1) > rigidMax) { rigidMax = Math.abs(d0 - d1); rigidWorst = sys + ' ' + ss[i].prn + '/' + ss[j].prn; }
    }
  }
}
H.check('同一轨道面内任意两颗距离恒定（≤5 m）', rigidMax <= 5, 'max=' + rigidMax.toFixed(3) + ' m ' + rigidWorst + '，同面配对 ' + planePairs + ' 对');
let sepMin = Infinity, sepWorst = '';
for (let step = 0; step < 48; step++) {
  const t = step * (43200 / 48);
  const ss = G.multiconst(t, ['G', 'E', 'C']);
  for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++) {
    const d = Math.hypot(ss[i].x - ss[j].x, ss[i].y - ss[j].y, ss[i].z - ss[j].z);
    if (d < sepMin) { sepMin = d; sepWorst = ss[i].prn + '/' + ss[j].prn; }
  }
}
H.check('全系统任意两颗 > 100 km', sepMin > 100e3, 'min=' + (sepMin / 1000).toFixed(1) + ' km @' + sepWorst);

H.section('可见性与几何改善（上海 t=0, 掩膜 10°）');
const rec = G.ecefFromGeodetic(31.2304, 121.4737, 50);
const visG = G.visible(G.multiconst(0, ['G']).map(s => Object.assign({}, s, { prn: s.prn })), rec, 10);
const visAll = G.visible(G.multiconst(0, ['G', 'E', 'C']), rec, 10);
H.check('GPS-only 可见 ≤ 12 颗', visG.length <= 12, 'got ' + visG.length);
H.check('三系统可见 ≥ 18 颗', visAll.length >= 18, 'got ' + visAll.length + '（' + ['G', 'E', 'C'].map(s2 => s2 + ':' + visAll.filter(v => v.sys === s2).length).join(' ') + '）');
const dG = G.dop(visG, rec), dAll = G.dop(visAll, rec);
H.check('两者都给出有效 DOP', dG.ok && dAll.ok);
H.check('三系统 PDOP < GPS-only PDOP', dAll.pdop < dG.pdop, '三系统 ' + H.fmt(dAll.pdop, 3) + ' < GPS ' + H.fmt(dG.pdop, 3));

H.section('绝对定向 oracle（逐颗核对契约解析式）');
function oracleEcef(sys, svn, t) {
  const P = {
    G: { a: 26561.75e3, i: 55, per: 4, raanK: 60, raanOff: 0, uBase: 90, uOff: 30, dither: 1.5, uAdd: 0 },
    E: { a: 29599.8e3, i: 56, per: 8, raanK: 120, raanOff: 0, uBase: 45, uOff: 15, dither: 0, uAdd: 0 },
    C: { a: 27906.1e3, i: 55, per: 8, raanK: 120, raanOff: 60, uBase: 45, uOff: 15, dither: 0, uAdd: 20 }
  }[sys];
  const D = Math.PI / 180, MU = G.CONST.mu, OE = G.CONST.OMEGA_E;
  const k = Math.floor(svn / P.per), j = svn % P.per;
  const raan = (P.raanK * k + P.raanOff) * D - OE * t;
  const u = (P.uBase * j + P.uOff * k + P.uAdd + P.dither * ((svn + 1) % 4)) * D + Math.sqrt(MU / (P.a * P.a * P.a)) * t;
  const px = P.a * Math.cos(u), py = P.a * Math.sin(u), inc = P.i * D;
  return { x: px * Math.cos(raan) - py * Math.sin(raan) * Math.cos(inc), y: px * Math.sin(raan) + py * Math.cos(raan) * Math.cos(inc), z: py * Math.sin(inc) };
}
let orMax = 0, orWorst = '';
for (const sys of ['G', 'E', 'C']) for (const t of [0, 12345.6]) {
  const list = G.multiconst(t, [sys]);
  for (const s of list) {
    const o = oracleEcef(sys, s.svn, t);
    const d = Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z);
    if (d > orMax) { orMax = d; orWorst = sys + ' ' + s.prn + ' t=' + t; }
  }
}
H.check('逐颗与契约解析式一致（≤1e-6 m，72 颗 × 2 时刻）', orMax <= 1e-6, 'max=' + orMax.toExponential(2) + ' m @' + orWorst);

H.section('健壮性与确定性');
let threw = false, r1 = null, r2 = null, rNull = null;
try { rNull = G.multiconst(0, null); r1 = G.multiconst(0, ['G', 'E']); r2 = G.multiconst(0, ['G', 'E']); } catch (e) { threw = true; }
H.check('非法 systems 不抛异常且返回空', !threw && Array.isArray(rNull) && rNull.length === 0, 'len=' + (rNull && rNull.length));
H.check('字符串 systems 返回空', Array.isArray(G.multiconst(0, 'G')) && G.multiconst(0, 'G').length === 0);
H.check('未知系统名被忽略（只剩 G）', G.multiconst(0, ['G', 'X']).length === 24, 'len=' + G.multiconst(0, ['G', 'X']).length);
H.check('两次调用逐位一致', r1 && r2 && r1.every((s, i) => s.x === r2[i].x && s.y === r2[i].y && s.z === r2[i].z));
const arr = ['G', 'E'];
const before = JSON.stringify(arr);
G.multiconst(1234.5, arr);
H.check('未修改入参', JSON.stringify(arr) === before);
H.summary();
