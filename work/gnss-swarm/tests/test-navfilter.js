'use strict';
/* 判据：导航滤波器 GNSS.navFilter（CONTRACT-v9.md §15）
 * 除了"误差更小"，还必须做一致性检验：NEES 均值（理论 3）与 95% 置信椭球覆盖率（理论 95%）。
 * 只比 RMS 的判据会被"把过程噪声调小、过度自信"骗过，NEES 不会。 */
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-navfilter.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ephemeris.js',
  __dirname + '/../winners/multiconst.js', __dirname + '/../winners/raim.js', target);
const REC = G.ecefFromGeodetic(31.2304, 121.4737, 50);
const SIG_PR = 30, NEP = 20, DT = 1;

function gauss(rnd) {
  const u = 1 - rnd(), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/* 生成历元与"真值表"：真值只放测试这边，历元里只有 sat 几何 + 伪距（防作弊） */
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
/* 单历元最小二乘基线：失败时沿用上一历元解，并记录失败历元（数据质量诊断）+ 可见星数 */
function lsSeries(epochs) {
  let guess = { x: REC.x + 4000, y: REC.y - 4000, z: REC.z + 3000, clockBias: 9000 };
  const out = [], failed = [], nvis = [];
  for (const ep of epochs) {
    nvis.push(ep.meas.length);
    const flat = ep.meas.map(m => ({ x: m.sat.x, y: m.sat.y, z: m.sat.z, prM: m.prM }));
    const s = G.solvePosition(flat, { guess: guess, clockBiasGuess: guess.clockBias });
    if (s.ok) { out.push({ x: s.x, y: s.y, z: s.z }); guess = { x: s.x, y: s.y, z: s.z, clockBias: s.clockBias }; }
    else { failed.push(ep.t); out.push(out.length ? out[out.length - 1] : { x: REC.x, y: REC.y, z: REC.z }); }
  }
  out.failed = failed;
  out.nvis = nvis;
  return out;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
function study(sysList, seed, vel) {
  const built = makeEpochs(sysList, seed, vel);
  const ls = lsSeries(built.epochs);
  const lsSol = ls[0] || { x: REC.x, y: REC.y, z: REC.z };
  const kf = G.navFilter(built.epochs, { x0: [lsSol.x, lsSol.y, lsSol.z, 12000, 0, 0, 0, 0] });
  const lsErr = [], kfErr = [], nees = [];
  for (let e = 0; e < NEP; e++) {
    lsErr.push(dist(ls[e], built.truth[e]));
    const x = kf.series[e].x;
    const d = [x[0] - built.truth[e].x, x[1] - built.truth[e].y, x[2] - built.truth[e].z];
    kfErr.push(Math.hypot(d[0], d[1], d[2]));
    const P = kf.series[e].P, Pp = [[P[0][0], P[0][1], P[0][2]], [P[1][0], P[1][1], P[1][2]], [P[2][0], P[2][1], P[2][2]]];
    const det = Pp[0][0] * (Pp[1][1] * Pp[2][2] - Pp[1][2] * Pp[2][1]) - Pp[0][1] * (Pp[1][0] * Pp[2][2] - Pp[1][2] * Pp[2][0]) + Pp[0][2] * (Pp[1][0] * Pp[2][1] - Pp[1][1] * Pp[2][0]);
    if (!(det > 1e-9)) continue;
    /* 3×3 逆的伴随式 */
    const a = [[Pp[1][1] * Pp[2][2] - Pp[1][2] * Pp[2][1], Pp[0][2] * Pp[2][1] - Pp[0][1] * Pp[2][2], Pp[0][1] * Pp[1][2] - Pp[0][2] * Pp[1][1]],
               [Pp[1][2] * Pp[2][0] - Pp[1][0] * Pp[2][2], Pp[0][0] * Pp[2][2] - Pp[0][2] * Pp[2][0], Pp[0][2] * Pp[1][0] - Pp[0][0] * Pp[1][2]],
               [Pp[1][0] * Pp[2][1] - Pp[1][1] * Pp[2][0], Pp[0][1] * Pp[2][0] - Pp[0][0] * Pp[2][1], Pp[0][0] * Pp[1][1] - Pp[0][1] * Pp[1][0]]];
    let q = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) q += d[i] * a[i][j] / det * d[j];
    if (isFinite(q)) nees.push(q);
  }
  return { lsRms: rms(lsErr), kfRms: rms(kfErr), kf: kf, nees: nees, lsErr: lsErr, kfErr: kfErr, lsFail: ls.failed.length, kfNonFinite: kfErr.filter(v => !isFinite(v)).length };
}
function mc(sysList, vel, M) {
  let ls = 0, kf = 0, nees = 0, hit = 0, n = 0, lsFail = 0, kfBad = 0, ep = 0;
  for (let seed = 1; seed <= M; seed++) {
    const r = study(sysList, seed, vel);
    ls += r.lsRms; kf += r.kfRms; lsFail += r.lsFail; kfBad += r.kfNonFinite; ep += NEP;
    for (const q of r.nees) { nees += q; n++; if (q <= 7.815) hit++; }
  }
  return { lsRms: ls / M, kfRms: kf / M, nees: nees / n, cover: hit / n, ratio: (kf / M) / (ls / M),
    lsFailRate: lsFail / ep, kfBadRate: kfBad / ep };
}

H.section('接口与形状');
H.check('navFilter 存在', typeof G.navFilter === 'function');
if (typeof G.navFilter !== 'function') H.summary();
const built0 = makeEpochs(['G'], 7, null);
const ls0 = lsSeries(built0.epochs)[0];
const r0 = G.navFilter(built0.epochs, { x0: [ls0.x, ls0.y, ls0.z, 12000, 0, 0, 0, 0] });
H.check('series 长度 = 历元数', r0.series && r0.series.length === NEP, r0.series && r0.series.length);
H.check('x 长度 8、P 为 8×8', Array.isArray(r0.x) && r0.x.length === 8 && Array.isArray(r0.P) && r0.P.length === 8 && r0.P[0].length === 8);
H.check('输出全为有限数', r0.x.every(isFinite) && r0.P.every(row => row.every(isFinite)) &&
  r0.series.every(s => s.x.every(isFinite) && s.P.every(row => row.every(isFinite))));

H.section('静态接收机（GPS-only，σ_pr=30 m，40 组独立噪声）');
const st = mc(['G'], null, 40);
console.log('  [实测] LS RMS=' + st.lsRms.toFixed(1) + ' m → KF RMS=' + st.kfRms.toFixed(1) + ' m（' + (1 / st.ratio).toFixed(2) + '× 改善）');
console.log('  [实测] NEES=' + st.nees.toFixed(2) + '（理论 3），95% 覆盖率=' + (100 * st.cover).toFixed(1) + '%');
H.check('KF 定位 RMS ≤ 0.6×单历元最小二乘', st.ratio <= 0.6, '比值=' + st.ratio.toFixed(2));
H.check('KF 定位 RMS ≤ 50 m', st.kfRms <= 50, st.kfRms.toFixed(1) + ' m');
H.check('一致性：NEES ∈ [2.0, 4.5]（理论 3）', st.nees >= 2.0 && st.nees <= 4.5, st.nees.toFixed(2));
H.check('一致性：95% 置信椭球覆盖率 ≥ 0.85（理论 0.95）', st.cover >= 0.85, st.cover.toFixed(3));

H.section('三系统（G+E+C）与动态（5 m/s）');
const st3 = mc(['G', 'E', 'C'], null, 20);
console.log('  [实测] 三系统 LS=' + st3.lsRms.toFixed(1) + ' → KF=' + st3.kfRms.toFixed(1) + ' m（' + (1 / st3.ratio).toFixed(2) + '×）NEES=' + st3.nees.toFixed(2));
H.check('三系统下 KF 仍优于最小二乘（≤0.8×）', st3.ratio <= 0.8, '比值=' + st3.ratio.toFixed(2));
const stD = mc(['G'], { x: 3, y: 2, z: 1 }, 20);
console.log('  [实测] 动态 LS=' + stD.lsRms.toFixed(1) + ' → KF=' + stD.kfRms.toFixed(1) + ' m（' + (1 / stD.ratio).toFixed(2) + '×）NEES=' + stD.nees.toFixed(2));
H.check('动态（匀速 5 m/s）下 KF ≤0.7×最小二乘', stD.ratio <= 0.7, '比值=' + stD.ratio.toFixed(2));
H.check('动态下速度状态被用上（|v| 与 5 m/s 同量级，2–12 m/s）',
  (function () { const v = study(['G'], 3, { x: 3, y: 2, z: 1 }).kf.x; return Math.hypot(v[4], v[5], v[6]) > 2 && Math.hypot(v[4], v[5], v[6]) < 12; })());

H.section('滤波器自身健壮性 vs 最小二乘的收敛性');
H.check('最小二乘基线失败率 < 10%（否则对比无意义）', st.lsFailRate < 0.10, (100 * st.lsFailRate).toFixed(1) + '% 历元不收敛');
H.check('滤波解在所有历元都有限（不依赖单历元收敛）', st.kfBadRate === 0, (100 * st.kfBadRate).toFixed(1) + '% 非有限');

H.section('协方差有效性（对称 + 正定）');
{
  const P = r0.P;
  let sym = 0, minDiag = Infinity;
  for (let i = 0; i < 8; i++) {
    minDiag = Math.min(minDiag, P[i][i]);
    for (let j = 0; j < 8; j++) sym = Math.max(sym, Math.abs(P[i][j] - P[j][i]));
  }
  const scale = Math.max.apply(null, P.map((row, i) => Math.abs(row[i])));
  H.check('协方差矩阵对称（相对误差 < 1e-6）', sym <= 1e-6 * scale, 'asym=' + sym.toExponential(2));
  H.check('对角线全为正（正定的必要条件）', minDiag > 0, 'min diag=' + minDiag.toExponential(2));
  /* 位置块 3×3 的主子式全正 ⇒ 正定 */
  const a = P[0][0], b = P[0][1], c = P[0][2], d = P[1][1], e = P[1][2], f = P[2][2];
  const det3 = a * (d * f - e * e) - b * (b * f - e * c) + c * (b * e - d * c);
  H.check('位置块 3×3 正定（行列式 > 0 且一阶主子式 > 0）', a > 0 && (a * d - b * b) > 0 && det3 > 0, 'det3=' + det3.toExponential(2));
}

H.section('观测不足 / 缺省初始化 / 确定性与入参保护');
{
  /* 只有 3 颗星的历元序列：只能预测，不能更新 */
  const thin = makeEpochs(['G'], 11, null);
  const few = thin.epochs.map((ep, i) => ({ t: ep.t, meas: i === 1 ? ep.meas.slice(0, 3) : ep.meas }));
  const lsT = lsSeries(few)[0];
  const r1 = G.navFilter(few, { x0: [lsT.x, lsT.y, lsT.z, 12000, 0, 0, 0, 0] });
  H.check('观测不足历元被标记 degraded', r1.degraded === true && r1.series[1].degraded === true);
  H.check('观测不足时只做预测（位置有限且未被拉飞，误差 < 5 km）',
    r1.x.every(isFinite) && Math.hypot(r1.x[0] - thin.truth[19].x, r1.x[1] - thin.truth[19].y, r1.x[2] - thin.truth[19].z) < 5000,
    '末历元误差=' + Math.hypot(r1.x[0] - thin.truth[19].x, r1.x[1] - thin.truth[19].y, r1.x[2] - thin.truth[19].z).toFixed(0) + ' m');

  /* 不给 x0：用 GNSS.solvePosition 初始化，usedLS 必须为 true */
  const auto = G.navFilter(built0.epochs, {});
  H.check('缺省 x0 时用最小二乘初始化（usedLS=true）', auto.usedLS === true && auto.x.every(isFinite));
  const autoErr = auto.series.map((s, e) => Math.hypot(s.x[0] - built0.truth[e].x, s.x[1] - built0.truth[e].y, s.x[2] - built0.truth[e].z));
  H.check('缺省初始化下 KF RMS ≤ 50 m', rms(autoErr) <= 50, rms(autoErr).toFixed(1) + ' m');

  const snapEpochs = JSON.stringify(built0.epochs.slice(0, 3));
  const optsObj = { sigmaAcc: 0.5, sigmaClkAcc: 1, sigmaPr: 30 };
  const optsSnap = JSON.stringify(optsObj);
  const k1 = G.navFilter(built0.epochs, { x0: [ls0.x, ls0.y, ls0.z, 12000, 0, 0, 0, 0] });
  const k2 = G.navFilter(built0.epochs, { x0: [ls0.x, ls0.y, ls0.z, 12000, 0, 0, 0, 0] });
  G.navFilter(built0.epochs, optsObj);
  H.check('两次调用逐位一致', k1.series.every((s, e) => s.x.every((v, i) => v === k2.series[e].x[i])));
  H.check('未修改 epochs 前 3 个历元', JSON.stringify(built0.epochs.slice(0, 3)) === snapEpochs);
  H.check('未修改 opts', JSON.stringify(optsObj) === optsSnap);
  let threw = false, bads = [];
  try { bads = [G.navFilter(null, {}), G.navFilter([], {}), G.navFilter('x', {}), G.navFilter([{ nope: 1 }], {})]; } catch (err) { threw = true; }
  H.check('非法输入返回空结果且不抛异常',
    !threw && bads.every(b => b && Array.isArray(b.series) && b.series.length === 0 && b.degraded === true), 'n=' + bads.length);
}
H.summary();
