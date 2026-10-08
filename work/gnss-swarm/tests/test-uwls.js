'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-uwls.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ephemeris.js', __dirname + '/../winners/raim.js', target);

const LAT = 31.2304, LON = 121.4737, H0 = 50;
const rec = G.ecefFromGeodetic(LAT, LON, H0);
const R = 22000000;
function enuDir(azDeg, elDeg) {
  const la = LAT * Math.PI / 180, lo = LON * Math.PI / 180, az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  const e = Math.cos(el) * Math.sin(az), n = Math.cos(el) * Math.cos(az), up = Math.sin(el);
  return {
    dx: -Math.sin(lo) * e - Math.sin(la) * Math.cos(lo) * n + Math.cos(la) * Math.cos(lo) * up,
    dy: Math.cos(lo) * e - Math.sin(la) * Math.sin(lo) * n + Math.cos(la) * Math.sin(lo) * up,
    dz: Math.cos(la) * n + Math.sin(la) * up
  };
}
const GEO = [[10, 12], [60, 25], [120, 70], [170, 45], [230, 65], [280, 18], [320, 40], [350, 80]];
function satsWithElevations() {
  return GEO.map(([az, el], k) => {
    const d = enuDir(az, el);
    return { prn: k + 1, x: rec.x + d.dx * R, y: rec.y + d.dy * R, z: rec.z + d.dz * R, elDeg: el };
  });
}
const err3 = s => Math.hypot(s.x - rec.x, s.y - rec.y, s.z - rec.z);

H.section('接口');
for (const f of ['uereSigma', 'weightedDop', 'solveWeighted']) H.check('存在 ' + f, typeof G[f] === 'function');
if (typeof G.uereSigma !== 'function' || typeof G.solveWeighted !== 'function') { H.check('三个加权函数必须齐备', false); H.summary(); }

H.section('UERE 权模型');
let mono = true, prev = -Infinity;   /* 仰角 90°→2° 递减，σ 应不减 */
for (const el of [90, 60, 45, 30, 20, 15, 10, 5, 2]) {
  const s = G.uereSigma(el, { zenithM: 0.5, horizonM: 0.4, elMinDeg: 5 });
  if (!(s > 0) || s < prev - 1e-12) mono = false;   /* 仰角降低 → σ 不减（早期版本把方向写反了） */
  prev = s;
}
H.check('σ 随仰角降低单调不减且恒正', mono, 'σ(5°)=' + H.fmt(G.uereSigma(5, { zenithM: 0.5, horizonM: 0.4 }), 3) + ' m');
H.approx('σ(90°) = sqrt(σz²+σh²)', G.uereSigma(90, { zenithM: 0.5, horizonM: 0.4 }), Math.hypot(0.5, 0.4), 1e-9, 'm');
H.approx('低于最低仰角时取下限保护', G.uereSigma(1, { zenithM: 0.5, horizonM: 0.4, elMinDeg: 5 }), G.uereSigma(5, { zenithM: 0.5, horizonM: 0.4, elMinDeg: 5 }), 1e-9, 'm');

H.section('等权时必须与 v1 最小二乘一致');
const sats = satsWithElevations();
const meas = G.simulatePseudoranges(sats, rec, { clockBiasM: 300, noiseSigmaM: 4, seed: 42 });
const p1 = G.solvePosition(meas, { guess: { x: rec.x + 200, y: rec.y - 200, z: rec.z + 200 } });
const ones = sats.map(() => 1);
const w1 = G.solveWeighted(meas, { guess: { x: rec.x + 200, y: rec.y - 200, z: rec.z + 200 }, sigmas: ones });
H.check('solveWeighted 返回 ok', w1 && w1.ok === true, w1 && w1.reason);
H.approx('等权解与 solvePosition 的 x 一致', w1.x, p1.x, 1e-6, 'm');
H.approx('等权解与 solvePosition 的 y 一致', w1.y, p1.y, 1e-6, 'm');
H.approx('等权解与 solvePosition 的 z 一致', w1.z, p1.z, 1e-6, 'm');
H.approx('等权解与 solvePosition 的钟差一致', w1.clockBias, p1.clockBias, 1e-6, 'm');

H.section('加权最优性');
let optOk = true, worsen = '';
for (let k = 0; k < 12; k++) {
  const sig = sats.map((s, i) => 0.4 + 2.6 * ((i + k) % 5) / 4);
  const m = G.simulatePseudoranges(sats, rec, { clockBiasM: -80, noiseSigmaM: 5, seed: 900 + k });
  const ws = G.solveWeighted(m, { guess: { x: rec.x + 300, y: rec.y + 300, z: rec.z - 300 }, sigmas: sig });
  const us = G.solvePosition(m, { guess: { x: rec.x + 300, y: rec.y + 300, z: rec.z - 300 } });
  const cost = s => {
    let c = 0;
    for (let i = 0; i < sats.length; i++) {
      const r = m[i].prM - (Math.hypot(sats[i].x - s.x, sats[i].y - s.y, sats[i].z - s.z) + s.clockBias);
      c += (r * r) / (sig[i] * sig[i]);
    }
    return c;
  };
  if (!ws.ok || !us.ok) { optOk = false; worsen = 'ok=false @k=' + k; break; }
  if (cost(ws) > cost(us) + 1e-6 * Math.max(1, cost(us))) { optOk = false; worsen = 'k=' + k + ' w=' + cost(ws).toFixed(3) + ' > u=' + cost(us).toFixed(3); break; }
}
H.check('加权解的加权代价不劣于等权解（12 组随机权重）', optOk, worsen);

H.section('蒙特卡洛：低仰角误差大时，加权应当更好');
const sigModel = sats.map(s => G.uereSigma(s.elDeg, { zenithM: 0.5, horizonM: 1.5 }));
let eUn = [], eWt = [];
for (let k = 0; k < 200; k++) {
  const rnd = G.mulberry32(4000 + k);
  const m = sats.map((s, i) => {
    const u1 = 1 - rnd(), u2 = rnd();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const rho = Math.hypot(s.x - rec.x, s.y - rec.y, s.z - rec.z);
    return { prn: s.prn, x: s.x, y: s.y, z: s.z, prM: rho + 100 + g * sigModel[i] };
  });
  const guess = { x: rec.x + 400, y: rec.y - 400, z: rec.z + 400 };
  const u = G.solvePosition(m, { guess: guess });
  const w = G.solveWeighted(m, { guess: guess, sigmas: sigModel });
  if (u.ok) eUn.push(err3(u));
  if (w.ok) eWt.push(err3(w));
}
const rms = a => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
const ru = rms(eUn), rw = rms(eWt);
H.check('200 次都返回有效解', eUn.length === 200 && eWt.length === 200, 'n=' + eUn.length + '/' + eWt.length);
H.check('加权三维 RMS 至少好 10%', rw <= ru * 0.90, '等权 ' + H.fmt(ru, 2) + ' m → 加权 ' + H.fmt(rw, 2) + ' m（改善 ' + H.fmt((1 - rw / ru) * 100, 1) + '%）');

H.section('加权 DOP');
const wd = G.weightedDop(sats, rec, sigModel);
const ud = G.dop(sats, rec);
H.check('weightedDop 返回 ok', wd && wd.ok === true, wd && wd.reason);
H.check('HDOP²+VDOP²=PDOP²（加权）', Math.abs(Math.hypot(wd.hdop, wd.vdop) - wd.pdop) / wd.pdop < 1e-6, 'pdop=' + H.fmt(wd.pdop, 3));
H.check('GDOP²=PDOP²+TDOP²（加权）', Math.abs(Math.hypot(wd.pdop, wd.tdop) - wd.gdop) / wd.gdop < 1e-6, 'gdop=' + H.fmt(wd.gdop, 3));
/* 注意：DOP 只描述几何。把低仰角观测降权会让"有效几何"变差，所以归一化后的加权 PDOP 不会更小——
 * 均匀权重才是 (GᵀW̃G)⁻¹ 意义下的最小值点（子代理用独立显式求逆复算确认，扫 w∝σ^p 的最小值恰在 p=0）。
 * 加权真正的收益体现在实际误差上，见下面那条"DOP 预测 vs 蒙特卡洛实测"。 */
H.check('均匀权重给出最小（归一化）PDOP，非均匀权重不会更低', wd.pdop >= ud.pdop - 1e-9, '加权 ' + H.fmt(wd.pdop, 3) + ' ≥ 等权 ' + H.fmt(ud.pdop, 3));
const flat = G.weightedDop(sats, rec, sats.map(() => 1));
H.approx('等权 sigmas 时加权 PDOP = 等权 PDOP', flat.pdop, ud.pdop, 1e-9, '');

H.section('健壮性与确定性');
const before = JSON.stringify(meas.map(m => m.prM));
let threw = false, bad = null;
try { bad = G.solveWeighted(meas, { sigmas: sats.map((s, i) => i === 0 ? 0 : 1) }); } catch (e) { threw = true; }
H.check('σ=0 不抛异常且 ok:false', !threw && bad && bad.ok === false, bad && bad.reason);
const a1 = G.solveWeighted(meas, { sigmas: sigModel }), a2 = G.solveWeighted(meas, { sigmas: sigModel });
H.check('两次调用逐位一致', a1.x === a2.x && a1.y === a2.y && a1.z === a2.z && a1.weightedRms === a2.weightedRms);
H.check('未修改入参', JSON.stringify(meas.map(m => m.prM)) === before);

H.section('DOP / 协方差预测 vs 蒙特卡洛实测');
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
function mm(A, B) { const C = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; for (let i=0;i<4;i++) for (let j=0;j<4;j++) { let s2=0; for (let k=0;k<4;k++) s2 += A[i][k]*B[k][j]; C[i][j]=s2; } return C; }
function Gmat(list, pos) { return list.map(s2 => { const dx=s2.x-pos.x, dy=s2.y-pos.y, dz=s2.z-pos.z, r=Math.hypot(dx,dy,dz); return [-dx/r,-dy/r,-dz/r,1]; }); }
function nrm(Gm, W) { const N=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; for (let i=0;i<Gm.length;i++) for (let a=0;a<4;a++) for (let b=0;b<4;b++) N[a][b] += Gm[i][a]*(W?W[i]:1)*Gm[i][b]; return N; }
function hRms(C) {
  const la=LAT*Math.PI/180, lo=LON*Math.PI/180;
  const E=[-Math.sin(lo),Math.cos(lo),0], N=[-Math.sin(la)*Math.cos(lo),-Math.sin(la)*Math.sin(lo),Math.cos(la)];
  const rowv=(v)=>[v[0]*C[0][0]+v[1]*C[1][0]+v[2]*C[2][0], v[0]*C[0][1]+v[1]*C[1][1]+v[2]*C[2][1], v[0]*C[0][2]+v[1]*C[1][2]+v[2]*C[2][2]];
  const re = rowv(E), rn = rowv(N);
  const U=[Math.cos(la)*Math.cos(lo), Math.cos(la)*Math.sin(lo), Math.sin(la)];
  const ru=rowv(U);
  /* 与蒙特卡洛同口径：三维（含高程分量）。早期版本只算了水平，导致预测比实测小 1.70 倍。 */
  return Math.sqrt((re[0]*E[0]+re[1]*E[1]+re[2]*E[2]) + (rn[0]*N[0]+rn[1]*N[1]+rn[2]*N[2]) + (ru[0]*U[0]+ru[1]*U[1]+ru[2]*U[2]));
}
const Gm = Gmat(sats, { x: rec.x, y: rec.y, z: rec.z });
const Wsig = sigModel.map(s2 => 1/(s2*s2));
const Cw = inv4(nrm(Gm, Wsig));
const Nu = inv4(nrm(Gm, null));
const Sig = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
for (let a=0;a<4;a++) for (let b=0;b<4;b++) { let s3=0; for (let i=0;i<Gm.length;i++) s3 += Gm[i][a]*(sigModel[i]*sigModel[i])*Gm[i][b]; Sig[a][b]=s3; }
const Cu = mm(mm(Nu, Sig), Nu);
const pU = hRms(Cu), pW = hRms(Cw), mcU = rms(eUn), mcW = rms(eWt);
H.check('等权：三明治协方差预测的三维 RMS 与实测同量级（0.7–1.4×）', mcU/pU > 0.7 && mcU/pU < 1.4, '预测 ' + H.fmt(pU,2) + ' m vs 实测 ' + H.fmt(mcU,2) + ' m（比 ' + H.fmt(mcU/pU,2) + '）');
H.check('加权：协方差预测的三维 RMS 与实测同量级（0.7–1.4×）', mcW/pW > 0.7 && mcW/pW < 1.4, '预测 ' + H.fmt(pW,2) + ' m vs 实测 ' + H.fmt(mcW,2) + ' m（比 ' + H.fmt(mcW/pW,2) + '）');
H.check('加权估计量的预测误差小于等权（这才是加权的收益）', pW < pU, '加权 ' + H.fmt(pW,3) + ' m < 等权 ' + H.fmt(pU,3) + ' m');
H.summary();
