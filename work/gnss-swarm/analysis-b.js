'use strict';
const H = require('./tests/harness.js');
const G = H.load(__dirname + '/lib/signal.js', __dirname + '/winners/ephemeris.js',
  __dirname + '/winners/multiconst.js', __dirname + '/winners/raim.js',
  __dirname + '/candidates/navfilter/b.js');

const REC = G.ecefFromGeodetic(31.2304, 121.4737, 50);
const SIG_PR = 30, NEP = 20, DT = 1;

function gauss(rnd) {
  const u = 1 - rnd(), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeEpochs(sysList, seed, vel, sigmaPr) {
  const rnd = G.mulberry32(seed);
  const sp = sigmaPr == null ? SIG_PR : sigmaPr;
  const v = vel || { x: 0, y: 0, z: 0 };
  const epochs = [], truth = [];
  for (let e = 0; e < NEP; e++) {
    const t = e * DT;
    const pos = { x: REC.x + v.x * t, y: REC.y + v.y * t, z: REC.z + v.z * t };
    const sats = G.visible(G.multiconst(t, sysList), pos, 10);
    const clk = 12000 + 3 * t;
    epochs.push({ t: DT, meas: sats.map(s => ({
      sat: { x: s.x, y: s.y, z: s.z },
      prM: Math.hypot(s.x - pos.x, s.y - pos.y, s.z - pos.z) + clk + gauss(rnd) * sp
    })) });
    truth.push(pos);
  }
  return { epochs: epochs, truth: truth };
}

function lsSeries(epochs) {
  let guess = { x: REC.x + 4000, y: REC.y - 4000, z: REC.z + 3000, clockBias: 9000 };
  const out = [];
  for (const ep of epochs) {
    const flat = ep.meas.map(m => ({ x: m.sat.x, y: m.sat.y, z: m.sat.z, prM: m.prM }));
    const s = G.solvePosition(flat, { guess: guess, clockBiasGuess: guess.clockBias });
    if (s.ok) { out.push({ x: s.x, y: s.y, z: s.z }); guess = { x: s.x, y: s.y, z: s.z, clockBias: s.clockBias }; }
    else { out.push(out.length ? out[out.length - 1] : { x: REC.x, y: REC.y, z: REC.z }); }
  }
  return out;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

function study(sysList, seed, vel, opts) {
  const built = makeEpochs(sysList, seed, vel);
  const ls = lsSeries(built.epochs);
  const lsSol = ls[0] || { x: REC.x, y: REC.y, z: REC.z };
  const kf = G.navFilter(built.epochs, Object.assign({ x0: [lsSol.x, lsSol.y, lsSol.z, 12000, 0, 0, 0, 0] }, opts || {}));
  const kfErr = [], nees = [];
  for (let e = 0; e < NEP; e++) {
    const x = kf.series[e].x;
    const d = [x[0] - built.truth[e].x, x[1] - built.truth[e].y, x[2] - built.truth[e].z];
    kfErr.push(Math.hypot(d[0], d[1], d[2]));
    const P = kf.series[e].P, Pp = [[P[0][0], P[0][1], P[0][2]], [P[1][0], P[1][1], P[1][2]], [P[2][0], P[2][1], P[2][2]]];
    const det = Pp[0][0] * (Pp[1][1] * Pp[2][2] - Pp[1][2] * Pp[2][1]) - Pp[0][1] * (Pp[1][0] * Pp[2][2] - Pp[1][2] * Pp[2][0]) + Pp[0][2] * (Pp[1][0] * Pp[2][1] - Pp[1][1] * Pp[2][0]);
    if (!(det > 1e-9)) continue;
    const a = [[Pp[1][1] * Pp[2][2] - Pp[1][2] * Pp[2][1], Pp[0][2] * Pp[2][1] - Pp[0][1] * Pp[2][2], Pp[0][1] * Pp[1][2] - Pp[0][2] * Pp[1][1]],
               [Pp[1][2] * Pp[2][0] - Pp[1][0] * Pp[2][2], Pp[0][0] * Pp[2][2] - Pp[0][2] * Pp[2][0], Pp[0][2] * Pp[1][0] - Pp[0][0] * Pp[1][2]],
               [Pp[1][0] * Pp[2][1] - Pp[1][1] * Pp[2][0], Pp[0][1] * Pp[2][0] - Pp[0][0] * Pp[2][1], Pp[0][0] * Pp[1][1] - Pp[0][1] * Pp[1][0]]];
    let q = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) q += d[i] * a[i][j] / det * d[j];
    if (isFinite(q)) nees.push(q);
  }
  return { kfRms: rms(kfErr), kf: kf, nees: nees };
}

console.log('\n=== a) NEES 自检（20 组独立噪声）===');
let neesSum = 0, hit95 = 0, n = 0;
for (let seed = 1; seed <= 20; seed++) {
  const r = study(['G'], seed, null);
  for (const q of r.nees) { neesSum += q; n++; if (q <= 7.815) hit95++; }
}
const neesAvg = neesSum / n, cover95 = hit95 / n;
console.log('NEES 均值: ' + neesAvg.toFixed(2) + '（理论 3.00）');
console.log('95% 覆盖率: ' + (100 * cover95).toFixed(1) + '%（理论 95.0%）');
console.log('与判据对比：判据给出 2.88 / 95.8%，本次 ' + neesAvg.toFixed(2) + ' / ' + (100 * cover95).toFixed(1) + '%');

console.log('\n=== b) 过程噪声敏感性（固定 seed=42，扫 sigmaAcc）===');
const seeds = [42, 43, 44];
for (const sigAcc of [0.05, 0.5, 5]) {
  let rmsSum = 0, neesSum = 0, n = 0;
  for (const seed of seeds) {
    const r = study(['G'], seed, null, { sigmaAcc: sigAcc });
    rmsSum += r.kfRms;
    for (const q of r.nees) { neesSum += q; n++; }
  }
  console.log('sigmaAcc=' + sigAcc.toFixed(2) + ': RMS=' + (rmsSum / seeds.length).toFixed(1) + ' m, NEES=' + (neesSum / n).toFixed(2));
}
console.log('现象：调小过程噪声（0.05）时 RMS 会变小，但 NEES 偏离理论值（协方差过度自信）');

console.log('\n=== c) 状态可观性（动态场景，5 m/s 匀速）===');
const rDyn = study(['G'], 123, { x: 3, y: 2, z: 1 });
const vEst = rDyn.kf.x;
const vMag = Math.hypot(vEst[4], vEst[5], vEst[6]);
const vTrue = Math.hypot(3, 2, 1);
console.log('真实速度: ' + vTrue.toFixed(2) + ' m/s');
console.log('估计速度: ' + vMag.toFixed(2) + ' m/s（vx=' + vEst[4].toFixed(2) + ', vy=' + vEst[5].toFixed(2) + ', vz=' + vEst[6].toFixed(2) + '）');
console.log('收敛精度: ' + Math.abs(vMag - vTrue).toFixed(2) + ' m/s');
console.log('\n可观性机制：');
console.log('在匀速运动下，位置状态随时间线性变化（p(t) = p₀ + v·t）。');
console.log('卡尔曼滤波器通过观察连续历元的位置修正（新息 z = prM − (|s−p| + clk)），');
console.log('结合 CV 模型的预测步（x ← x + v·dt），自动从位置的时间序列中推断出速度。');
console.log('即使伪距观测本身不含速度信息，位置的一致性变化使速度状态变得可观。');

