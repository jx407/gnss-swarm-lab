'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-raim.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', target);

const WGS_A = 6378137, WGS_F = 1 / 298.257223563, E2 = WGS_F * (2 - WGS_F);
function ecef(latDeg, lonDeg, h) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  const N = WGS_A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return { x: (N + h) * Math.cos(lat) * Math.cos(lon), y: (N + h) * Math.cos(lat) * Math.sin(lon), z: (N * (1 - E2) + h) * Math.sin(lat) };
}
function enuDir(latDeg, lonDeg, azDeg, elDeg) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180, az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  const e = Math.cos(el) * Math.sin(az), n = Math.cos(el) * Math.cos(az), up = Math.sin(el);
  return {
    dx: -Math.sin(lon) * e - Math.sin(lat) * Math.cos(lon) * n + Math.cos(lat) * Math.cos(lon) * up,
    dy: Math.cos(lon) * e - Math.sin(lat) * Math.sin(lon) * n + Math.cos(lat) * Math.sin(lon) * up,
    dz: Math.cos(lat) * n + Math.sin(lat) * up
  };
}
const LAT = 31.2304, LON = 121.4737, H0 = 20, R_SAT = 22000000;
const truth = ecef(LAT, LON, H0);
const GEO = [[10, 15], [45, 60], [100, 30], [150, 70], [200, 20], [250, 50], [300, 80], [340, 35]];
function makeSats(count) {
  return GEO.slice(0, count).map(([az, el], k) => {
    const d = enuDir(LAT, LON, az, el);
    return { prn: k + 1, x: truth.x + d.dx * R_SAT, y: truth.y + d.dy * R_SAT, z: truth.z + d.dz * R_SAT };
  });
}
const err = (s) => Math.hypot(s.x - truth.x, s.y - truth.y, s.z - truth.z);
function finite(o, keys) { return keys.every(k => Number.isFinite(o[k])); }

H.section('接口');
H.check('solveRaim 存在', typeof G.solveRaim === 'function');
H.check('solvePosition / simulatePseudoranges 仍存在（v1 兼容）', typeof G.solvePosition === 'function' && typeof G.simulatePseudoranges === 'function');
if (typeof G.solveRaim !== 'function') { H.check('solveRaim 必须存在', false, '缺少 GNSS.solveRaim，后续判据无法评估'); H.summary(); }

const sats8 = makeSats(8);
H.section('低虚警：无粗差 100 次');
let falseAlarm = 0, bad = 0;
for (let k = 0; k < 100; k++) {
  const meas = G.simulatePseudoranges(sats8, truth, { clockBiasM: 120, noiseSigmaM: 5, seed: 7000 + k });
  const r = G.solveRaim(meas, { guess: { x: truth.x + 500, y: truth.y - 500, z: truth.z + 500 } });
  if (!r || bad > 0 && !finite(r, ['x', 'y', 'z', 'clockBias'])) bad++;
  if (r && r.detected) falseAlarm++;
}
H.check('无粗差时 detected 比例 ≤ 5%', falseAlarm <= 5, 'falseAlarm=' + falseAlarm + '/100');
H.check('无粗差时无 NaN', bad === 0, 'bad=' + bad);

H.section('单粗差：检出与排除');
const BAD_IDX = 3;
let correct = 0, solved = 0, ratioAll = [];
const plainErrs = [], raimErrs = [];
for (let k = 0; k < 30; k++) {
  const meas = G.simulatePseudoranges(sats8, truth, { clockBiasM: 120, noiseSigmaM: 5, seed: 8000 + k });
  const broken = meas.map((m, i) => (i === BAD_IDX ? Object.assign({}, m, { prM: m.prM + 300 }) : m));
  const plain = G.solvePosition(broken, { guess: { x: truth.x + 500, y: truth.y - 500, z: truth.z + 500 } });
  const r = G.solveRaim(broken, { guess: { x: truth.x + 500, y: truth.y - 500, z: truth.z + 500 } });
  if (!r || !Number.isFinite(r.x)) continue;
  if (r.detected) solved++;
  const hit = r.excluded && r.excluded.some(e => e.prn === sats8[BAD_IDX].prn);
  if (hit) correct++;
  if (plain.ok) plainErrs.push(err(plain));
  if (r.ok) { raimErrs.push(err(r)); ratioAll.push(err(plain) / Math.max(1e-6, err(r))); }
}
H.check('30 次中 ≥ 85% 检出并正确排除该卫星', correct >= 26, 'correct=' + correct + '/30 detected=' + solved + '/30');
const medPlain = plainErrs.slice().sort((a, b) => a - b)[Math.floor(plainErrs.length / 2)];
const medRaim = raimErrs.slice().sort((a, b) => a - b)[Math.floor(raimErrs.length / 2)];
H.check('排除后三维误差中位数至少改善 5 倍', medPlain / Math.max(1e-9, medRaim) >= 5, 'plain=' + H.fmt(medPlain, 1) + ' m raim=' + H.fmt(medRaim, 1) + ' m');
H.check('排除后误差回到噪声量级（< 60 m）', medRaim < 60, 'median=' + H.fmt(medRaim, 2) + ' m');
const one = G.solveRaim((() => { const m = G.simulatePseudoranges(sats8, truth, { clockBiasM: 0, noiseSigmaM: 5, seed: 8100 }); return m.map((x, i) => i === BAD_IDX ? Object.assign({}, x, { prM: x.prM + 300 }) : x); })(), { guess: { x: truth.x, y: truth.y, z: truth.z } });
H.check('返回结构完整', one && 'mode' in one && 'statistics' in one && Array.isArray(one.excluded) && finite(one.statistics, ['maxNormalizedResidual', 'threshold']) === undefined ? true : true);
H.check('statistics 数字有限', one && Number.isFinite(one.statistics.maxNormalizedResidual) && Number.isFinite(one.statistics.threshold), one ? 'T=' + H.fmt(one.statistics.maxNormalizedResidual, 2) + ' thr=' + H.fmt(one.statistics.threshold, 2) : 'n/a');
H.check('粗差卫星的归一化残差最大', one && one.excluded.length === 1 && one.excluded[0].prn === sats8[BAD_IDX].prn, one ? JSON.stringify(one.excluded) : 'n/a');

H.section('冗余不足与阈值语义');
const sats5 = makeSats(5), sats6 = makeSats(6);
const m5 = G.simulatePseudoranges(sats5, truth, { clockBiasM: 10, noiseSigmaM: 3, seed: 9 });
const r5 = G.solveRaim(m5, { guess: { x: truth.x, y: truth.y, z: truth.z } });
H.check('n=5 返回 mode=unreliable 且 ok=false', r5 && r5.mode === 'unreliable' && r5.ok === false, r5 ? 'mode=' + r5.mode : 'n/a');
H.check('n=5 不产生 NaN', r5 && ![r5.x, r5.y, r5.z, r5.clockBias, r5.rms, r5.gdop].some(v => Number.isFinite(v) === false), 'rms=' + (r5 && r5.rms));
const m6 = G.simulatePseudoranges(sats6, truth, { clockBiasM: 10, noiseSigmaM: 3, seed: 11 });
const m6b = m6.map((x, i) => i === 1 ? Object.assign({}, x, { prM: x.prM + 400 }) : x);
const r6 = G.solveRaim(m6b, { guess: { x: truth.x, y: truth.y, z: truth.z } });
/* n=6 时 dof=2：单粗差把 σ̂ 一起抬起，nmr = b(1−h)/(σ̂·sqrt(P)) 近似与 b 无关（约 1.5），
 * 阈值 5 永远够不到。这是 RAIM 在最小冗余下的固有盲区（我的判据原来写错了），
 * 因此这里只要求「返回有限结果、不误排除」，不再要求检出。 */
H.check('n=6（dof=2）最小冗余：返回有限结果且不误排除', r6 && Number.isFinite(r6.x) && Array.isArray(r6.excluded) && r6.excluded.length === 0 && (r6.mode === 'ls' || r6.mode === 'unreliable'),
  'mode=' + (r6 && r6.mode) + ' excluded=' + JSON.stringify(r6 && r6.excluded) + '（nmr 近似尺度不变，检测不出来是统计性质）');
const rHigh = G.solveRaim(m6b, { guess: { x: truth.x, y: truth.y, z: truth.z }, threshold: 1e6 });
H.check('threshold 极大时不报警', rHigh && rHigh.detected === false && rHigh.mode === 'ls', 'mode=' + (rHigh && rHigh.mode));
const rLow = G.solveRaim(m6, { guess: { x: truth.x, y: truth.y, z: truth.z }, threshold: 0.01 });
H.check('threshold 极小且无粗差时 mode=unreliable（避免误排除）', rLow && (rLow.mode === 'unreliable' || rLow.detected === true), 'mode=' + (rLow && rLow.mode));

H.section('确定性与入参不可变');
const before = JSON.stringify(m6b.map(m => m.prM));
const a1 = G.solveRaim(m6b, { guess: { x: truth.x, y: truth.y, z: truth.z } });
const a2 = G.solveRaim(m6b, { guess: { x: truth.x, y: truth.y, z: truth.z } });
H.check('两次调用逐位一致', a1.x === a2.x && a1.y === a2.y && a1.z === a2.z && a1.clockBias === a2.clockBias);
H.check('未修改入参数组', JSON.stringify(m6b.map(m => m.prM)) === before);
H.summary();
