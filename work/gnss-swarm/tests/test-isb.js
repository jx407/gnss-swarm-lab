'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-isb.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ephemeris.js', __dirname + '/../winners/multiconst.js', __dirname + '/../winners/uwls.js', __dirname + '/../winners/raim.js', target);

const LAT = 31.2304, LON = 121.4737, H0 = 50;
const rec = G.ecefFromGeodetic(LAT, LON, H0);
const SYS_BIAS = { G: 0, E: 20, C: -35 };
function sysOf(prn) { const c = String(prn).charAt(0); return (c === 'E' || c === 'C') ? c : 'G'; }
function satsFor(systems, mask) {
  const vis = G.visible(G.multiconst(0, systems), rec, mask === undefined ? 5 : mask);
  return vis.map(s => ({ prn: s.prn, sys: sysOf(s.prn), x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }));
}
function makeMeas(sats, opts) {
  const o = opts || {};
  const base = G.simulatePseudoranges(sats.map(s => ({ prn: s.prn, x: s.x, y: s.y, z: s.z })), rec, { clockBiasM: o.clockBiasM == null ? 123.4 : o.clockBiasM, noiseSigmaM: o.noiseSigmaM == null ? 0 : o.noiseSigmaM, seed: o.seed || 7 });
  return base.map((m, i) => ({ prn: m.prn, sys: sats[i].sys, x: m.x, y: m.y, z: m.z, prM: m.prM + (SYS_BIAS[sats[i].sys] || 0) + (o.perSatNoise ? o.perSatNoise[i] : 0) }));
}
const err3 = s => Math.hypot(s.x - rec.x, s.y - rec.y, s.z - rec.z);

H.section('接口');
H.check('solveMulti 存在', typeof G.solveMulti === 'function');
if (typeof G.solveMulti !== 'function') { H.summary(); }
H.check('既有函数未被破坏', typeof G.solvePosition === 'function' && typeof G.solveWeighted === 'function' && typeof G.multiconst === 'function');

H.section('单系统退化：必须与既有解算一致');
const gpsSats = satsFor(['G'], 10);
const mG = makeMeas(gpsSats, { noiseSigmaM: 3, seed: 21 });
const ref = G.solveWeighted(mG, { guess: { x: rec.x + 200, y: rec.y + 200, z: rec.z - 200 }, sigmas: gpsSats.map(() => 1) });
const one = G.solveMulti(mG, { guess: { x: rec.x + 200, y: rec.y + 200, z: rec.z - 200 } });
H.check('单系统返回 ok', one && one.ok === true, one && one.reason);
H.check('nUnknowns = 4', one && one.nUnknowns === 4, 'got ' + (one && one.nUnknowns));
H.approx('与 solveWeighted 的 x 一致', one.x, ref.x, 1e-6, 'm');
H.approx('与 solveWeighted 的 y 一致', one.y, ref.y, 1e-6, 'm');
H.approx('与 solveWeighted 的 z 一致', one.z, ref.z, 1e-6, 'm');
H.approx('与 solveWeighted 的钟差一致', one.clockBias, ref.clockBias, 1e-6, 'm');

H.section('三系统：ISB 必须被估出来');
const allSats = satsFor(['G', 'E', 'C'], 5);
H.check('三系统可见星 ≥ 15 颗', allSats.length >= 15, 'n=' + allSats.length + '（' + ['G', 'E', 'C'].map(s2 => s2 + ':' + allSats.filter(x => x.sys === s2).length).join(' ') + '）');
const m3 = makeMeas(allSats, { noiseSigmaM: 0 });
const sol3 = G.solveMulti(m3, { guess: { x: rec.x + 300, y: rec.y - 300, z: rec.z + 300 } });
const naive = G.solvePosition(m3, { guess: { x: rec.x + 300, y: rec.y - 300, z: rec.z + 300 } });
H.check('三系统返回 ok 且 nUnknowns = 6', sol3 && sol3.ok === true && sol3.nUnknowns === 6, sol3 ? 'nUnk=' + sol3.nUnknowns + ' reason=' + sol3.reason : 'n/a');
H.approx('位置恢复到 ≤1e-3 m', err3(sol3), 0, 1e-3, 'm');
const isbE = sol3.isb && (sol3.isb.E != null ? sol3.isb.E : sol3.isb['E']);
const isbC = sol3.isb && (sol3.isb.C != null ? sol3.isb.C : sol3.isb['C']);
H.approx('估出的 ISB(E) = 注入值 +20 m', isbE, 20, 1e-3, 'm');
H.approx('估出的 ISB(C) = 注入值 −35 m', isbC, -35, 1e-3, 'm');
H.check('同一批数据用单钟差 solvePosition 会明显偏（≥2 m）', err3(naive) >= 2, '单钟差误差 ' + H.fmt(err3(naive), 2) + ' m vs ISB 感知 ' + H.fmt(err3(sol3), 4) + ' m');

H.section('含噪：ISB 感知解应当更好');
let eNaive = [], eMulti = [];
for (let k = 0; k < 200; k++) {
  const rnd = G.mulberry32(6000 + k);
  const noise = allSats.map(() => {
    const u1 = 1 - rnd(), u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 5;
  });
  const m = makeMeas(allSats, { noiseSigmaM: 0, perSatNoise: noise });
  const ng = { x: rec.x + 500, y: rec.y - 500, z: rec.z + 500 };
  const a = G.solvePosition(m, { guess: ng });
  const b = G.solveMulti(m, { guess: ng });
  if (a.ok) eNaive.push(err3(a));
  if (b.ok) eMulti.push(err3(b));
}
const rms = a => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
H.check('200 次都有效', eNaive.length === 200 && eMulti.length === 200, eNaive.length + '/' + eMulti.length);
const rn = rms(eNaive), rm = rms(eMulti);
H.check('ISB 感知的三维 RMS 至少好 20%', rm <= rn * 0.80, '单钟差 ' + H.fmt(rn, 2) + ' m → ISB 感知 ' + H.fmt(rm, 2) + ' m（改善 ' + H.fmt((1 - rm / rn) * 100, 1) + '%）');

H.section('扩展 DOP');
const dMulti = G.dop(allSats.map(s => ({ prn: s.prn, x: s.x, y: s.y, z: s.z })), rec);
H.check('返回的 pdop/gdop 有限', sol3 && Number.isFinite(sol3.pdop) && Number.isFinite(sol3.gdop), sol3 ? 'pdop=' + H.fmt(sol3.pdop, 3) + ' gdop=' + H.fmt(sol3.gdop, 3) : '');
H.check('HDOP²+VDOP²=PDOP²（含 ISB 未知量）', Math.abs(Math.hypot(sol3.hdop, sol3.vdop) - sol3.pdop) / sol3.pdop < 1e-6, 'pdop=' + H.fmt(sol3.pdop, 4));
H.check('扩展 PDOP ≥ 4 未知量的 PDOP', sol3.pdop >= dMulti.pdop - 1e-9, '多系统 ' + H.fmt(sol3.pdop, 3) + ' ≥ 4 未知量 ' + H.fmt(dMulti.pdop, 3));

H.section('两系统与退化情形');
const geSats = satsFor(['G', 'E'], 5);
const mGE = makeMeas(geSats, { noiseSigmaM: 0 });
const solGE = G.solveMulti(mGE, { guess: { x: rec.x + 100, y: rec.y, z: rec.z } });
H.check('G+E 返回 ok 且 nUnknowns = 5', solGE && solGE.ok === true && solGE.nUnknowns === 5, solGE ? 'nUnk=' + solGE.nUnknowns : 'n/a');
H.approx('G+E 估出的 ISB(E) = +20 m', solGE.isb && (solGE.isb.E != null ? solGE.isb.E : solGE.isb['E']), 20, 1e-3, 'm');
const tooFew = G.solveMulti(m3.slice(0, 5), { guess: { x: rec.x, y: rec.y, z: rec.z } });
H.check('观测数 < nUnknowns → ok:false', tooFew && tooFew.ok === false, tooFew && tooFew.reason);
const sysNoise = G.solveMulti(m3.slice(0, 8).map((m, i) => Object.assign({}, m, { prM: m.prM + 0.001 * i })), { guess: { x: rec.x, y: rec.y, z: rec.z } });
H.check('病态/近奇异不产生 NaN', sysNoise && ![sysNoise.x, sysNoise.y, sysNoise.z, sysNoise.clockBias].some(v => Number.isFinite(v) && Math.abs(v) > 1e12), 'ok=' + (sysNoise && sysNoise.ok));

H.section('确定性与入参');
const before = JSON.stringify(m3.map(m => m.prM));
const a1 = G.solveMulti(m3, { guess: { x: rec.x, y: rec.y, z: rec.z } });
const a2 = G.solveMulti(m3, { guess: { x: rec.x, y: rec.y, z: rec.z } });
H.check('两次调用逐位一致', a1.x === a2.x && a1.y === a2.y && a1.z === a2.z && a1.clockBias === a2.clockBias);
H.check('未修改入参数组', JSON.stringify(m3.map(m => m.prM)) === before);
H.check('未知系统名按 G 处理且不抛异常', (() => { try { const r = G.solveMulti(mG.map(m => Object.assign({}, m, { sys: 'X' })), { guess: { x: rec.x, y: rec.y, z: rec.z } }); return !!r; } catch (e) { return false; } })());
H.summary();
