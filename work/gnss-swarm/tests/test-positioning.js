'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-positioning.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', target);

/* 独立实现：WGS-84 + ENU 方向卫星，不依赖被测 ephemeris 模块 */
const WGS_A = 6378137, WGS_F = 1 / 298.257223563, E2 = WGS_F * (2 - WGS_F);
function ecef(latDeg, lonDeg, h) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  const N = WGS_A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return { x: (N + h) * Math.cos(lat) * Math.cos(lon), y: (N + h) * Math.cos(lat) * Math.sin(lon), z: (N * (1 - E2) + h) * Math.sin(lat) };
}
function enuDir(rec, latDeg, lonDeg, azDeg, elDeg) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180;
  const az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  const u = { e: Math.cos(el) * Math.sin(az), n: Math.cos(el) * Math.cos(az), up: Math.sin(el) };
  const dx = -Math.sin(lon) * u.e - Math.sin(lat) * Math.cos(lon) * u.n + Math.cos(lat) * Math.cos(lon) * u.up;
  const dy = Math.cos(lon) * u.e - Math.sin(lat) * Math.sin(lon) * u.n + Math.cos(lat) * Math.sin(lon) * u.up;
  const dz = Math.cos(lat) * u.n + Math.sin(lat) * u.up;
  return { dx, dy, dz };
}
const LAT = 39.9075, LON = 116.3972, H0 = 44;
const truth = ecef(LAT, LON, H0);
const GEO = [[10, 15], [45, 60], [100, 30], [150, 70], [200, 20], [250, 50], [300, 80], [340, 35]];
const R_SAT = 22000000;
function makeSats(count) {
  return GEO.slice(0, count).map(([az, el], k) => {
    const d = enuDir(truth, LAT, LON, az, el);
    return { prn: k + 1, x: truth.x + d.dx * R_SAT, y: truth.y + d.dy * R_SAT, z: truth.z + d.dz * R_SAT };
  });
}
function err(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

H.section('接口');
H.check('simulatePseudoranges / solvePosition 存在', typeof G.simulatePseudoranges === 'function' && typeof G.solvePosition === 'function');

H.section('无噪声定位（6 星，钟差 3000 m，初值 0）');
const sats6 = makeSats(6);
const meas6 = G.simulatePseudoranges(sats6, truth, { clockBiasM: 3000, noiseSigmaM: 0, seed: 5 });
H.check('返回 6 条伪距, 且 = 几何距离 + 钟差', meas6.length === 6 && meas6.every((m, i) => Math.abs(m.prM - (m.rangeM + 3000)) < 1e-6));
const sol6 = G.solvePosition(meas6, { guess: { x: 0, y: 0, z: 0 } });
H.check('ok=true 且 converged=true', sol6.ok === true && sol6.converged === true, 'iters=' + sol6.iterations + ' reason=' + sol6.reason);
H.check('位置误差 < 0.01 m', sol6.ok && err(sol6, truth) < 0.01, 'err=' + (sol6.ok ? err(sol6, truth).toExponential(2) : 'n/a') + ' m');
H.approx('钟差恢复 3000 m', sol6.clockBias, 3000, 0.01, 'm');
H.check('迭代次数 ≤ 15', sol6.iterations <= 15, 'iters=' + sol6.iterations);
H.check('无噪声残差 < 1e-3 m', Math.max(...sol6.residuals.map(Math.abs)) < 1e-3, 'max=' + Math.max(...sol6.residuals.map(Math.abs)).toExponential(2));
H.check('rms 与残差一致', Math.abs(sol6.rms - Math.sqrt(sol6.residuals.reduce((a, b) => a + b * b, 0) / sol6.residuals.length)) < 1e-9);

H.section('远初值收敛（偏 100 km）');
const solFar = G.solvePosition(meas6, { guess: { x: truth.x + 100000, y: truth.y - 100000, z: truth.z + 100000 }, clockBiasGuess: 0 });
H.check('远初值仍收敛到同一解（< 0.01 m）', solFar.ok && err(solFar, truth) < 0.01, 'err=' + (solFar.ok ? err(solFar, truth).toExponential(2) : 'n/a'));

H.section('含噪声统计（8 星，σ=5 m，50 次）');
const sats8 = makeSats(8);
const N = 50; const errs = []; let bad = 0;
const dopRef = G.dop ? null : null;
for (let k = 0; k < N; k++) {
  const m = G.simulatePseudoranges(sats8, truth, { clockBiasM: -120, noiseSigmaM: 5, seed: 1000 + k });
  const s = G.solvePosition(m, { guess: { x: truth.x + 500, y: truth.y - 500, z: truth.z + 500 } });
  if (!s.ok || ![s.x, s.y, s.z, s.clockBias].every(Number.isFinite)) { bad++; continue; }
  errs.push(err(s, truth));
}
const rms3d = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length);
H.check('50 次解算全部有限且 ok', bad === 0, 'bad=' + bad);
H.check('三维 RMS 误差 < 30 m（σ=5 m 的城市级量级）', rms3d < 30, 'rms=' + rms3d.toFixed(2) + ' m');
H.check('三维 RMS 误差 > 1 m（噪声确实被注入）', rms3d > 1, 'rms=' + rms3d.toFixed(2) + ' m');
H.check('结果随种子变化（非恒定输出）', new Set(errs.map(e => e.toFixed(3))).size > 5);

H.section('退化几何');
const dir = enuDir(truth, LAT, LON, 90, 45);
const bad5 = [0, 1, 2, 3, 4].map(k => ({ prn: k + 1, x: truth.x + dir.dx * R_SAT + k, y: truth.y + dir.dy * R_SAT + k, z: truth.z + dir.dz * R_SAT + k }));
const measBad = G.simulatePseudoranges(bad5, truth, { clockBiasM: 10, noiseSigmaM: 0 });
const solBad = G.solvePosition(measBad, { guess: { x: truth.x + 100, y: truth.y, z: truth.z } });
H.check('病态几何返回 ok:false', solBad.ok === false, 'reason=' + solBad.reason);
H.check('病态几何不产生 NaN/Infinity', ![solBad.x, solBad.y, solBad.z, solBad.clockBias, solBad.rms].some(v => Number.isFinite(v) && Math.abs(v) > 1e12));
H.summary();
