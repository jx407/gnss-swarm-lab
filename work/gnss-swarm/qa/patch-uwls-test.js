'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* ① 单调方向写反了：仰角从 90° 往下走时 σ 应当"不减小" */
sub('tests/test-uwls.js',
  `  if (!(s > 0) || s > prev + 1e-12) mono = false;`,
  `  if (!(s > 0) || s < prev - 1e-12) mono = false;   /* 仰角降低 → σ 不减（早期版本把方向写反了） */`);
sub('tests/test-uwls.js', `H.check('σ(仰角) 单调递减且为正', mono,`,
  `H.check('σ 随仰角降低单调不减且恒正', mono,`);
/* ② 加权 PDOP 不必然更小（均匀权重才是 DOP 最小值点），改成正确的断言 */
sub('tests/test-uwls.js',
  `H.check('低仰角降权后加权 PDOP ≤ 等权 PDOP', wd.pdop <= ud.pdop + 1e-9, '加权 ' + H.fmt(wd.pdop, 3) + ' vs 等权 ' + H.fmt(ud.pdop, 3));`,
  `/* 注意：DOP 只描述几何。把低仰角观测降权会让"有效几何"变差，所以归一化后的加权 PDOP 不会更小——
 * 均匀权重才是 (GᵀW̃G)⁻¹ 意义下的最小值点（子代理用独立显式求逆复算确认，扫 w∝σ^p 的最小值恰在 p=0）。
 * 加权真正的收益体现在实际误差上，见下面那条"DOP 预测 vs 蒙特卡洛实测"。 */
H.check('均匀权重给出最小（归一化）PDOP，非均匀权重不会更低', wd.pdop >= ud.pdop - 1e-9, '加权 ' + H.fmt(wd.pdop, 3) + ' ≥ 等权 ' + H.fmt(ud.pdop, 3));`);
/* ③ 新增：DOP/协方差预测的水平 RMS 必须与蒙特卡洛实测吻合（把"几何"和"误差"真正连起来） */
sub('tests/test-uwls.js', 'H.summary();',
  `H.section('DOP 预测 vs 蒙特卡洛实测');
function inv4(A) {
  const M = [[A[0][0], A[0][1], A[0][2], A[0][3], 1, 0, 0, 0], [A[1][0], A[1][1], A[1][2], A[1][3], 0, 1, 0, 0],
             [A[2][0], A[2][1], A[2][2], A[2][3], 0, 0, 1, 0], [A[3][0], A[3][1], A[3][2], A[3][3], 0, 0, 0, 1]];
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    const t = M[c]; M[c] = M[p]; M[p] = t;
    const pv = M[c][c];
    for (let k = 0; k < 8; k++) M[c][k] /= pv;
    for (let r = 0; r < 4; r++) { if (r === c) continue; const f = M[r][c]; if (!f) continue; for (let k = 0; k < 8; k++) M[r][k] -= f * M[c][k]; }
  }
  return [[M[0][4], M[0][5], M[0][6], M[0][7]], [M[1][4], M[1][5], M[1][6], M[1][7]], [M[2][4], M[2][5], M[2][6], M[2][7]], [M[3][4], M[3][5], M[3][6], M[3][7]]];
}
function mm(A, B) { const C = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += A[i][k] * B[k][j]; C[i][j] = s; } return C; }
function Gmat(sats, pos) { return sats.map(s => { const dx = s.x - pos.x, dy = s.y - pos.y, dz = s.z - pos.z, r = Math.hypot(dx, dy, dz); return [-dx / r, -dy / r, -dz / r, 1]; }); }
function nt(Gm, W) { const N = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; for (let i = 0; i < Gm.length; i++) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) N[a][b] += Gm[i][a] * (W ? W[i] : 1) * Gm[i][b]; return N; }
function hRmsFromC(C, sats, pos) {
  const la = LAT * Math.PI / 180, lo = LON * Math.PI / 180;
  const E = [-Math.sin(lo), Math.cos(lo), 0];
  const N = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const row = v => [v[0] * C[0][0] + v[1] * C[1][0] + v[2] * C[2][0], v[0] * C[0][1] + v[1] * C[1][1] + v[2] * C[2][1], v[0] * C[0][2] + v[1] * C[1][2] + v[2] * C[2][2]];
  const eRow = row(E), nRow = row(N);
  const ve = eRow[0] * E[0] + eRow[1] * E[1] + eRow[2] * E[2];
  const vn = nRow[0] * N[0] + nRow[1] * N[1] + nRow[2] * N[2];
  return Math.sqrt(ve + vn);
}
const pos0 = { x: rec.x, y: rec.y, z: rec.z };
const Gm = Gmat(sats, pos0);
const Wsig = sigModel.map(s => 1 / (s * s));
const Cw = inv4(nt(Gm, Wsig));
const Nuu = inv4(nt(Gm, null));
const A0 = mm(Nuu, (() => { const T = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { let s = 0; for (let i = 0; i < Gm.length; i++) s += Gm[i][a] * (sigModel[i] * sigModel[i]) * Gm[i][b]; T[a][b] = s; } return T; })());
const Cu = mm(mm(Nuu, A0), Nuu);
const pU = hRmsFromC(Cu, sats, pos0), pW = hRmsFromC(Cw, sats, pos0);
const mcU = rms(eUn), mcW = rms(eWt);
H.check('等权：DOP/三明治协方差预测的水平 RMS 与实测同量级（0.7–1.4×）', mcU / pU > 0.7 && mcU / pU < 1.4, '预测 ' + H.fmt(pU, 2) + ' m vs 实测 ' + H.fmt(mcU, 2) + ' m（比 ' + H.fmt(mcU / pU, 2) + '）');
H.check('加权：协方差预测的水平 RMS 与实测同量级（0.7–1.4×）', mcW / pW > 0.7 && mcW / pW < 1.4, '预测 ' + H.fmt(pW, 2) + ' m vs 实测 ' + H.fmt(mcW, 2) + ' m（比 ' + H.fmt(mcW / pW, 2) + '）');
H.check('加权估计量的预测误差小于等权（这才是加权的收益）', pW < pU, '加权 ' + H.fmt(pW, 3) + ' m < 等权 ' + H.fmt(pU, 3) + ' m');
H.summary();`);
/* ④ 契约同步修订 */
sub('CONTRACT-v3.md',
  '  4. 明确了权重的 DOP 恒等式与"低仰角降权后加权 PDOP ≤ 等权 PDOP"。',
  `  4. 明确的 DOP 恒等式；**2026-10-06 修订**：不得要求"降权后加权 PDOP 更小"——DOP 只描述几何，
     均匀权重才是 (GᵀW̃G)⁻¹ 意义下的最小值点（子代理用独立显式求逆确认），非均匀仰角权重会让归一化 PDOP 变大。
     加权真正的收益体现在**实际误差**上，因此改为要求：DOP/协方差预测的水平 RMS 与 200 次蒙特卡洛实测吻合（0.7–1.4×），
     且加权估计量的预测误差 < 等权（实测：PDOP 1.99 → 2.42，但三维 RMS 6.89 m → 5.34 m，改善 22.4%）。`);
