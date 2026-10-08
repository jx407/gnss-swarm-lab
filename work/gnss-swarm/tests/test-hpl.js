'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-hpl.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ephemeris.js', __dirname + '/../winners/multiconst.js', __dirname + '/../winners/uwls.js', __dirname + '/../winners/raim.js', target);

const LAT = 31.2304, LON = 121.4737, H0 = 50;
const rec = G.ecefFromGeodetic(LAT, LON, H0);
function sysOf(prn) { const c = String(prn).charAt(0); return (c === 'E' || c === 'C') ? c : 'G'; }
function satsFor(systems, mask) {
  return G.visible(G.multiconst(0, systems), rec, mask == null ? 10 : mask).map(s => ({ prn: s.prn, sys: sysOf(s.prn), x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }));
}
function measFor(sats, sigma, seed) {
  const base = G.simulatePseudoranges(sats, rec, { clockBiasM: 111.1, noiseSigmaM: sigma || 0, seed: seed || 3 });
  return base.map((m, i) => ({ prn: m.prn, sys: sats[i].sys, x: m.x, y: m.y, z: m.z, prM: m.prM }));
}
const enu = d => {
  const la = LAT * Math.PI / 180, lo = LON * Math.PI / 180;
  return {
    e: -Math.sin(lo) * d.x + Math.cos(lo) * d.y,
    n: -Math.sin(la) * Math.cos(lo) * d.x - Math.sin(la) * Math.sin(lo) * d.y + Math.cos(la) * d.z,
    u: Math.cos(la) * Math.cos(lo) * d.x + Math.cos(la) * Math.sin(lo) * d.y + Math.sin(la) * d.z
  };
};

H.section('接口');
H.check('protectionLevels 存在', typeof G.protectionLevels === 'function');
if (typeof G.protectionLevels !== 'function') { H.summary(); }

H.section('有效几何下的基本性质');
const gps = satsFor(['G']);
const mGps = measFor(gps, 3, 5);
const pl = G.protectionLevels(mGps, { sigma0: 3 });
H.check('返回 ok 且 hpl/vpl 为正', pl && pl.ok === true && pl.hpl > 0 && pl.vpl > 0, pl ? 'hpl=' + H.fmt(pl.hpl, 2) + ' vpl=' + H.fmt(pl.vpl, 2) + ' reason=' + pl.reason : 'n/a');
H.check('VPL > HPL（垂直比水平更差）', pl.vpl > pl.hpl, 'vpl=' + H.fmt(pl.vpl, 2) + ' hpl=' + H.fmt(pl.hpl, 2));
H.check('sigmaHat 采用先验 sigma0', Math.abs(pl.sigmaHat - 3) < 1e-9, 'sigmaHat=' + H.fmt(pl.sigmaHat, 3));
H.check('worstPrn 落在输入卫星里', gps.some(s => String(s.prn) === String(pl.worstPrn)), 'worst=' + pl.worstPrn);

H.section('尺度线性');
const pl2 = G.protectionLevels(mGps, { sigma0: 6 });
H.check('sigma0 ×2 → HPL/VPL ×2（<1%）', Math.abs(pl2.hpl / pl.hpl - 2) < 0.01 && Math.abs(pl2.vpl / pl.vpl - 2) < 0.01,
  'HPL ' + H.fmt(pl.hpl, 3) + '→' + H.fmt(pl2.hpl, 3) + '，VPL ' + H.fmt(pl.vpl, 3) + '→' + H.fmt(pl2.vpl, 3));
const plT = G.protectionLevels(mGps, { sigma0: 3, threshold: 10 });
H.check('threshold ×2 → HPL/VPL ×2（<1%）', Math.abs(plT.hpl / pl.hpl - 2) < 0.01 && Math.abs(plT.vpl / pl.vpl - 2) < 0.01,
  'HPL ' + H.fmt(pl.hpl, 3) + '→' + H.fmt(plT.hpl, 3));

H.section('几何改善：三系统保护限级应更小');
const all = satsFor(['G', 'E', 'C']);
const mAll = measFor(all, 3, 5);
const plAll = G.protectionLevels(mAll, { sigma0: 3 });
H.check('三系统返回 ok', plAll && plAll.ok === true, plAll && plAll.reason);
H.check('三系统 HPL < GPS-only HPL', plAll.hpl < pl.hpl, '三系统 ' + H.fmt(plAll.hpl, 2) + ' m < GPS ' + H.fmt(pl.hpl, 2) + ' m');
H.check('三系统 VPL < GPS-only VPL', plAll.vpl < pl.vpl, '三系统 ' + H.fmt(plAll.vpl, 2) + ' m < GPS ' + H.fmt(pl.vpl, 2) + ' m');

H.section('覆盖率（保护限级必须罩住真实误差）');
let covH = 0, covV = 0, n = 0, worstH = 0, hplRef = 0;
for (let k = 0; k < 200; k++) {
  const rnd = G.mulberry32(9100 + k);
  const noise = all.map(() => { const u1 = 1 - rnd(), u2 = rnd(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 5; });
  const base = G.simulatePseudoranges(all, rec, { clockBiasM: 111.1, noiseSigmaM: 0, seed: 3 });
  const m = base.map((mm, i) => ({ prn: mm.prn, sys: all[i].sys, x: mm.x, y: mm.y, z: mm.z, prM: mm.prM + noise[i] }));
  const p = G.protectionLevels(m, { sigma0: 5 });
  if (!p.ok) continue;
  const sol = G.solvePosition(m, { guess: { x: rec.x, y: rec.y, z: rec.z } });
  if (!sol.ok) continue;
  const e = enu({ x: sol.x - rec.x, y: sol.y - rec.y, z: sol.z - rec.z });
  const eH = Math.hypot(e.e, e.n), eV = Math.abs(e.u);
  n++;
  if (eH <= p.hpl) covH++;
  if (eV <= p.vpl) covV++;
  worstH = Math.max(worstH, eH / p.hpl);
  hplRef = p.hpl;
}
H.check('200 次全部有效', n >= 195, 'n=' + n);
H.check('水平覆盖率 ≥ 99%', covH / n >= 0.99, (100 * covH / n).toFixed(1) + '%（HPL≈' + H.fmt(hplRef, 1) + ' m，最坏比值 ' + H.fmt(worstH, 2) + '）');
H.check('垂直覆盖率 ≥ 99%', covV / n >= 0.99, (100 * covV / n).toFixed(1) + '%');

H.section('健壮性');
const few = G.protectionLevels(mGps.slice(0, 3), { sigma0: 3 });
H.check('观测 <4 → ok:false', few && few.ok === false, few && few.reason);
H.check('观测 <4 时不返回 NaN', few && ![few.hpl, few.vpl, few.sigmaHat].some(v => Number.isFinite(v) === false && v !== undefined), 'hpl=' + few.hpl);
const before = JSON.stringify(mAll.map(m => m.prM));
const a1 = G.protectionLevels(mAll, { sigma0: 3 }), a2 = G.protectionLevels(mAll, { sigma0: 3 });
H.check('两次调用逐位一致', a1.hpl === a2.hpl && a1.vpl === a2.vpl);
H.check('未修改入参', JSON.stringify(mAll.map(m => m.prM)) === before);
H.summary();
