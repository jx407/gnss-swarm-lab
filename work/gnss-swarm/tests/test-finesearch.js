'use strict';
/* 判据：码相位精修（winners/finesearch.js）
 *
 * 被锁死的机制（本轮 ds4.1 子代理独立提出、我方独立复现，见 CONTRACT-v20 §21）：
 *   信号与复制码都按采样格硬采样 ⇒ 同一采样格内的所有 codePhase 给出**逐样本相同**的码序列
 *   ⇒ 相关值**逐位相同** ⇒ 峰顶是一段宽度 W = 1/spc chip 的平台。
 *   - 取"首个最大" = 平台左边缘 → RMS = W/√3（比信息下限差 2 倍）
 *   - 取平台中心            → RMS = W/√12（该采样率下的信息下限）
 *   - **提高信噪比完全无效**（平台内是同一个浮点数）
 */
const H = require('./harness.js');
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ca-code.js',
  __dirname + '/../winners/acquisition-v2.js', __dirname + '/../winners/finesearch.js');
const CHIP_M = G.CONST.c / G.CONST.F_CODE;
const SPCS = [4, 8, 16, 40];
const fsOf = spc => spc * 1.023e6;
const wrap = d => { while (d > 511.5) d -= 1023; while (d < -511.5) d += 1023; return d; };
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const now = () => Number(process.hrtime.bigint()) / 1e6;
/* 确定性伪随机（与 proto-fine4/6 同一串，便于逐位复现） */
function rndSeq(seed, n) { let a = seed >>> 0; const o = []; for (let i = 0; i < n; i++) { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); o.push(((t ^ (t >>> 14)) >>> 0) / 4294967296); } return o; }
const TRUTHS = rndSeq(20261006, 12).map((v, i) => (i * 1023 / 12 + v) % 1023);
function mk(spc, truth, snr, seed, dop) { return G.makeSignal({ prn: 1, codePhase: truth, dopplerHz: dop == null ? 1200 : dop, snrDb: snr, ms: 4, seed: seed == null ? 4242 : seed, fs: fsOf(spc) }); }

H.section('导出与输入校验');
H.check('fineSearch / codePhaseFloorM 已导出', typeof G.fineSearch === 'function' && typeof G.codePhaseFloorM === 'function');
if (typeof G.fineSearch !== 'function') H.summary();
const bad = [
  ['null 信号', G.fineSearch(null, 0)],
  /* 下面 4 类是 ds4.1 子代理攻击出来的"静默通过"（v20 §21 已修）：winChips=0/-5 被悄悄夹成 0.05、
     estimator 未知值时静默走平台中心、tol=1e300 把"平台"撑成整窗（plateauM=311 m）。 */
  ['winChips=-5', G.fineSearch(mk(16, 412.3, 60), 412.3, { winChips: -5 })],
  ['estimator 未知', G.fineSearch(mk(16, 412.3, 60), 412.3, { estimator: 'bogus' })],
  ['tol=1e300', G.fineSearch(mk(16, 412.3, 60), 412.3, { tol: 1e300 })],
  ['i/q 不等长', G.fineSearch({ i: new Float32Array(4), q: new Float32Array(3), n: 4, fs: 4092000, prn: 1 }, 0)],
  ['fs 非法', G.fineSearch({ i: new Float32Array(4), q: new Float32Array(4), n: 4, fs: 0, prn: 1 }, 0)],
  ['coarseChips=NaN', G.fineSearch(mk(4, 412.3, 60), NaN)],
  ['PRN 非法', G.fineSearch({ i: new Float32Array(4092), q: new Float32Array(4092), n: 4092, fs: 4092000, prn: 99, ms: 1 }, 0)],
  ['短于一个码周期', G.fineSearch({ i: mk(4, 412.3, 60).i.slice(0, 100), q: mk(4, 412.3, 60).q.slice(0, 100), n: 100, fs: 4092000, prn: 1, ms: 0.02 }, 0)]
];
let allFail = true, why = '';
for (const [name, r] of bad) { if (!r || r.ok !== false || typeof r.reason !== 'string' || !r.reason) { allFail = false; why += name + '(' + JSON.stringify(r) + ') '; } }
H.check('9 类非法输入都返回 {ok:false, reason}', allFail, why || 'all rejected');
/* winChips=0 从"被静默夹紧"改成**显式支持**：单点求值（只做一次相关，返回该点的幅度），
   供判据/诊断用——tests/test-bandlimit.js 用它在平台内逐点取相关值。 */
const w0 = G.fineSearch(mk(16, 412.3, 60), 412.3, { winChips: 0 });
H.check('winChips=0 = 显式单点求值（ok、评估次数 ≤3、不报 edgeHit）',
  w0.ok === true && w0.evals <= 3 && w0.edgeHit === false, 'evals=' + w0.evals + ' edgeHit=' + w0.edgeHit);
H.check('NaN 样本被拒', G.fineSearch({ i: new Float32Array([NaN, 1, 1, 1]), q: new Float32Array(4), n: 4, fs: 4092000, prn: 1, ms: 1 }, 0).ok === false);
H.check('窗口过大被拒（maxEvals 保护）', G.fineSearch(mk(40, 412.3, 60), 412.3, { winChips: 400 }).ok === false);

H.section('平台机制：同一采样格内相关值逐位相同');
let sameAll = true, sameInfo = '';
for (const spc of SPCS) {
  const sig = mk(spc, 412.3, 60);
  const k = Math.floor(412.3 * spc);
  const a = G.fineSearch(sig, k / spc, { winChips: 0.01, stepChips: 1 / spc });
  const b = G.fineSearch(sig, (k + 0.999) / spc, { winChips: 0.01, stepChips: 1 / spc });
  if (a.amp !== b.amp) { sameAll = false; sameInfo += 'spc=' + spc + ' ' + a.amp + '≠' + b.amp + ' '; }
}
H.check('平台两端相关幅度逐位相同（=== 比较）', sameAll, sameInfo || '4/8/16/40 全部相等');
/* ds4.1 攻击指出：原判据 `plateauM ≈ c/fs` 在默认 step 下是**恒等式**（plateauM = (hi-lo+1)·step 且默认
   每平台只含 1 个网格点 ⇒ 恒等于 1/spc），喂纯噪声也会过。改成三个**不同**的量分别断言：
   · resolutionM  = c/fs        —— 模型量（采样率决定的分辨率元），与 stepChips 无关
   · sigmaM       = resolutionM/√12 —— 信息下限
   · plateauM     = 本次扫描观测到的等值段宽 —— 只保证 ∈ [step, resolutionM]，默认 step 时 = resolutionM */
const fr2 = SPCS.map(spc => {
  const r = G.fineSearch(mk(spc, 412.3, 60), 412.3);
  return { spc, cfs: (G.CONST.c / G.CONST.F_CODE) / spc, res: r.resolutionM, sig: r.sigmaM, pla: r.plateauM, step: r.stepChips };
});
H.check('resolutionM = c/fs（4/16/40 spc → 73.3/18.3/7.3 m）',
  fr2.every(o => Math.abs(o.res - o.cfs) < 1e-9 * o.cfs),
  fr2.map(o => o.spc + 'spc:' + o.res.toFixed(2) + 'm').join(' '));
H.check('sigmaM = resolutionM/√12（信息下限，与 stepChips 无关）',
  fr2.every(o => Math.abs(o.sig - o.res / Math.sqrt(12)) < 1e-9 * o.res),
  fr2.map(o => o.spc + 'spc:' + o.sig.toFixed(2) + 'm').join(' '));
H.check('默认 step=1/spc 时观测平台宽 plateauM = resolutionM',
  fr2.every(o => Math.abs(o.pla - o.res) < 1e-9 * o.res),
  fr2.map(o => o.spc + 'spc:plateau=' + o.pla.toFixed(2)).join(' '));
const stepDep = [0.01, 0.02, 0.05, 0.08].map(st => G.fineSearch(mk(16, 412.3, 60), 412.3, { stepChips: st, winChips: 0.5 }).plateauM);
/* 实测（也修正了我自己的预期）：网格粗到与平台同量级时，一个平台里可能落进 2 个格点，
   于是 plateauM 会**超过** resolutionM（step=0.05 chip 时 29.31 m > 18.33 m）。正确上界是 resolutionM + step。
   所以 plateauM 只能当"扫描观测到的等值段宽"用；物理量是 resolutionM。 */
H.check('plateauM ∈ [step, resolutionM+step] 且随 stepChips 变（它只是观测等值段宽，不能当模型平台宽）',
  stepDep.every((v, i) => { const st = [0.01, 0.02, 0.05, 0.08][i] * CHIP_M; return v >= st - 1e-9 && v <= 18.33 + st + 1e-6; }) && stepDep[2] > stepDep[1],
  'step 0.01/0.02/0.05/0.08 → plateauM ' + stepDep.map(v => v.toFixed(2) + 'm').join(' '));
H.check('分辨率下限随采样率线性提高（4→40 提高 10 倍）',
  Math.abs(G.codePhaseFloorM(fsOf(4)) / G.codePhaseFloorM(fsOf(40)) - 10) < 1e-9,
  SPCS.map(s => s + 'spc:' + G.codePhaseFloorM(fsOf(s)).toFixed(2) + 'm').join(' '));

H.section('信噪比不是杠杆：−20 dB 与 60 dB 的估计必须逐位相同');
let snrSame = true, snrInfo = '';
for (const spc of [4, 16, 40]) {
  const lo = G.fineSearch(mk(spc, 412.3, -20), 412.47, { dopplerHz: 1200 });
  const hi = G.fineSearch(mk(spc, 412.3, 60), 412.47, { dopplerHz: 1200 });
  if (lo.chips !== hi.chips) { snrSame = false; snrInfo += 'spc=' + spc + ' ' + lo.chips + '≠' + hi.chips + ' '; }
}
H.check('三档采样率下 −20/60 dB 估计逐位相同', snrSame, snrInfo || 'identical');

H.section('方向：必须与 makeSignal/acquire 同向（不是 correlateAt 的镜像）');
/* 上一版我把判据写成了恒等式：correlateOffsetToChips(chipsToCorrelateOffset(g)) ≡ g，等于没测。
   真正能锁死方向的判据是两条：
   (1) 喂 g≈真值 → 估计必须落在**真值的平台**上（若内部误用镜像约定，峰在 1023−g 处 ≈58 km 外）；
   (2) 独立用 correlateAt 验证：相关峰确实在"镜像采样偏移"上，从而证明两套约定并存且本模块取了生成器那套。 */
let dirOk = true, dirInfo = '';
for (const spc of [4, 16, 40]) {
  const truth = 412.3, sig = mk(spc, truth, -20);
  const good = G.fineSearch(sig, truth + 0.11, { dopplerHz: 1200 });
  const eGood = Math.abs(wrap(good.chips - truth)) * CHIP_M;
  if (!(eGood <= good.plateauM / 2 + 1e-9)) { dirOk = false; dirInfo += 'spc=' + spc + ' err=' + eGood.toFixed(1) + 'm '; }
}
H.check('喂 g≈真值 → 估计落在真值平台内（镜像约定会偏到 1023−g）', dirOk, dirInfo || '4/16/40 均落在平台内（≤W/2）');
const sigW = mk(16, 412.3, -20);
const wide = G.fineSearch(sigW, 412.3, { dopplerHz: 1200, winChips: 6 });
H.check('±6 chip 宽窗下全局峰仍在真值平台（不是镜像处）',
  Math.abs(wrap(wide.chips - 412.3)) * CHIP_M <= wide.plateauM / 2 + 1e-9,
  'err=' + (Math.abs(wrap(wide.chips - 412.3)) * CHIP_M).toFixed(2) + 'm evals=' + wide.evals);
const aGen = G.correlateAt(sigW, 412.3 * (sigW.fs / 1023e3), 1200, 4);
const aMir = G.correlateAt(sigW, G.chipsToCorrelateOffset(412.3, sigW.fs), 1200, 4);
H.check('correlateAt 的峰在镜像偏移上（生成器约定处只有噪声）', aMir >= aGen * 10,
  '镜像=' + aMir.toFixed(0) + ' 生成器约定处=' + aGen.toFixed(0) + '（' + (aMir / aGen).toFixed(1) + '×）');

/* 标定必须用**足够多的**跨格真值：上一版只用 12 个，40spc 档的 frac(t·spc) 恰好偏小
   （样本均方 0.129 对理论 0.333），把"首个最大"的相对误差压到 1.24 倍 → 判据假失败。
   这里改用 n=96 的确定性均匀真值，并把理论值本身也写进判据（argmax 的 RMS/W 应等于
   RMS(frac(t·spc))）。积分只取 1 个码周期——平台位置与积分长度无关，纯量化问题不需要 4 ms。 */
const RCAL = rndSeq(31337, 96);
const TRUTHS_CAL = RCAL.map(v => 1023 * v);
const mkCal = (spc, t) => G.makeSignal({ prn: 1, codePhase: t, dopplerHz: 1200, snrDb: 30, ms: 1, seed: 11, fs: fsOf(spc) });
const cal = {}, fracRms = {}, cenTheory = {};
for (const spc of SPCS) {
  const fr = TRUTHS_CAL.map(t => t * spc - Math.floor(t * spc));
  fracRms[spc] = Math.sqrt(fr.reduce((s, v) => s + v * v, 0) / fr.length);
  cenTheory[spc] = Math.sqrt(fr.reduce((s, v) => s + (0.5 - v) * (0.5 - v), 0) / fr.length) / spc * CHIP_M;
}
for (const est of ['argmax', 'parab', 'centroid']) {
  cal[est] = {};
  for (const spc of SPCS) {
    const errs = TRUTHS_CAL.map(t => Math.abs(wrap(G.fineSearch(mkCal(spc, t), t + 0.13, { dopplerHz: 1200, estimator: est, winChips: 0.2 }).chips - t)) * CHIP_M);
    cal[est][spc] = rms(errs);
  }
}
H.check('标定真值 n=96：RMS(frac(t·spc)) ∈ [0.52,0.63]（理论 0.577）',
  SPCS.every(s => fracRms[s] >= 0.52 && fracRms[s] <= 0.63), SPCS.map(s => s + ':' + fracRms[s].toFixed(3)).join(' '));
H.check('"首个最大 = 平台左边缘" ⇒ RMS/W 与 RMS(frac) 一致（±0.06）',
  SPCS.every(s => Math.abs(cal.argmax[s] / (CHIP_M / s) - fracRms[s]) <= 0.06),
  SPCS.map(s => s + ':实测' + (cal.argmax[s] / (CHIP_M / s)).toFixed(3) + '/理论' + fracRms[s].toFixed(3)).join(' '));
H.check('"平台中心" ⇒ 实测 RMS 与 (1/spc)·RMS(0.5−frac) 一致（±25%）',
  SPCS.every(s => Math.abs(cal.centroid[s] - cenTheory[s]) <= 0.25 * cenTheory[s]),
  SPCS.map(s => s + ':实测' + cal.centroid[s].toFixed(2) + '/理论' + cenTheory[s].toFixed(2) + 'm').join(' '));
H.check('平台中心估计的 RMS / (W/√12) ∈ [0.8, 1.35]',
  SPCS.every(s => { const r = cal.centroid[s] / G.codePhaseFloorM(fsOf(s)); return r >= 0.8 && r <= 1.35; }),
  SPCS.map(s => s + ':' + (cal.centroid[s] / G.codePhaseFloorM(fsOf(s))).toFixed(3)).join(' '));
H.check('"首个最大"相对下限差 ≥1.5 倍（实测应≈2）',
  SPCS.every(s => cal.argmax[s] / G.codePhaseFloorM(fsOf(s)) >= 1.5),
  SPCS.map(s => s + ':' + (cal.argmax[s] / G.codePhaseFloorM(fsOf(s))).toFixed(2)).join(' '));
H.check('抛物插值在平台峰上几乎无用（≥ argmax 的 0.9 倍）',
  SPCS.every(s => cal.parab[s] >= cal.argmax[s] * 0.9),
  SPCS.map(s => s + ':argmax=' + cal.argmax[s].toFixed(1) + '/parab=' + cal.parab[s].toFixed(1)).join(' '));
H.check('平台中心优于首个最大 ≥1.6 倍（四档都要）',
  SPCS.every(s => cal.argmax[s] / cal.centroid[s] >= 1.6),
  SPCS.map(s => s + ':' + (cal.argmax[s] / cal.centroid[s]).toFixed(2) + '×').join(' '));

H.section('代价：窄窗细修远便宜于全码搜索');
let costOk = true, costInfo = '';
for (const spc of [16, 40]) {
  const r = G.fineSearch(mk(spc, 412.3, -20), 412.3, { dopplerHz: 1200, winChips: 0.5 });
  const need = 2 * Math.ceil(0.5 / (1 / spc)) + 2;   /* +1：auto 估计器的"峰顶是不是平台"探测 */
  if (r.evals !== need) { costOk = false; costInfo += 'spc=' + spc + ' evals=' + r.evals + ' expect=' + need + ' '; }
}
H.check('相关评估次数 = 2·ceil(win·spc)+2（16spc:18 / 40spc:42；+1 是 auto 的平台探测）', costOk, costInfo || '18 / 42');
/* 计时必须取"多次的**最小值**"并先热身：上一版只测一次，受 JIT/GC 影响实测 16spc/4spc
   在两次运行里分别给出 1.20× 和 3.96×（同一份代码）——把噪声当判据是我自己的错。
   review/probe-cost.js（独立进程、min-of-5）的稳定结论：
     acquire 相对 4spc：8spc 1.09× / 16spc 1.37× / 40spc 6.79×
     （操作数模型只预测 1.02/1.05/1.14 ⇒ 40spc 已进入内存带宽瓶颈：cos/sin 表 1.3MB×2 超出 L2）
     两阶段 4+16 = 0.116s vs 全局 16spc 0.152s（便宜 24%）；4+40 = 0.176s vs 0.755s（便宜 4.3 倍） */
const bestMs = (fn, reps) => { fn(); let b = Infinity; for (let i = 0; i < reps; i++) { const t = now(); fn(); const d = now() - t; if (d < b) b = d; } return b; };
const tAcq = [], tFine = [];
for (const spc of [4, 16, 40]) { const sig = mk(spc, 412.3, -20); tAcq.push(bestMs(() => G.acquire(sig, { dopplerStepHz: 100 }), 3)); }
for (const spc of [16, 40]) { const sig = mk(spc, 412.3, -20); tFine.push(bestMs(() => G.fineSearch(sig, 412.3, { dopplerHz: 1200 }), 3)); }
H.check('16spc 细修 < 4spc 全码捕获的 20%（实测≈5%）', tFine[0] < tAcq[0] * 0.2,
  'fine16=' + tFine[0].toFixed(1) + 'ms acq4=' + tAcq[0].toFixed(1) + 'ms');
/* ds4.1 复现到 acq16/acq4 最多 4.52×（同一份代码）。**跨档计时的比值不能当判据**，
   只打印；能断言的是"细修相对同档全码捕获是零头"（下面两条，同一档内比较，稳）。 */
console.log('  （参考，不作判据）acq16/acq4 = ' + (tAcq[1] / tAcq[0]).toFixed(2) + '×、acq40/acq4 = ' + (tAcq[2] / tAcq[0]).toFixed(2) +
  '×；独立进程 min-of-5（review/probe-cost.js）给 1.09× / 6.79×，ds4.1 复现 4+40 只便宜 1.8–5.3 倍');
/* 跨档总耗时也不是可靠判据（本轮实测 acq16 甚至比 acq4 快：0.98×）。ds4.1 复现的结论是
   "4+40 便宜 1.8–5.3 倍，取决于当次 JIT/GC/内存带宽状态"，所以这里只打印、不断言。 */
/* 注意：本测试进程前面已分配过上千个大 Float64Array，acq4 的绝对值会比独立进程里高 3~4 倍
   （review/probe-cost.js 里 acq4=111ms，这里 400ms）。所以"两阶段总耗时"这种跨档相除的判据不稳，
   改成**同档相比**：细修相对同采样率的全码捕获必须是零头（这条差距 >10 倍，稳）。
   两阶段总代价只打印不做断言；独立进程的稳定结论是 4+40 = 176ms vs 全局 40 = 755ms（便宜 4.3 倍）。 */
H.check('40spc 细修 < 同档全码捕获的 20%（实测量级 ≈7%）', tFine[1] < tAcq[2] * 0.2,
  'fine40=' + tFine[1].toFixed(0) + 'ms acq40=' + tAcq[2].toFixed(0) + 'ms');
console.log('  （参考）两阶段 4+16 = ' + (tAcq[0] + tFine[0]).toFixed(0) + 'ms，4+40 = ' + (tAcq[0] + tFine[1]).toFixed(0)
  + 'ms；全局 4=' + tAcq[0].toFixed(0) + 'ms 16=' + tAcq[1].toFixed(0) + 'ms 40=' + tAcq[2].toFixed(0) + 'ms');

H.section('边界行为');
const cw = G.fineSearch(mk(16, 0.4, -20), 1022.9, { dopplerHz: 1200 });
H.check('粗值跨 0/1023 边界仍落在真值平台上', Math.abs(wrap(cw.chips - 0.4)) * CHIP_M <= cw.plateauM / 2 + 1e-9,
  'chips=' + cw.chips.toFixed(5) + ' err=' + (Math.abs(wrap(cw.chips - 0.4)) * CHIP_M).toFixed(2) + 'm');
/* ds4.1 攻击（本轮最重要的修正）：原来这里只用 seed=4242 一个种子，恰好噪声峰落在窗边缘，
   于是"粗值偏 3 chip 必须报 edgeHit"**侥幸通过**；200 个种子实测 edgeHit 只报 40/200 = 20%，
   其余 160 个静默返回错答案（RMS 903.8 m）。真正的防线是幅度门 weak（ampPerSample < 0.35）。 */
let caught = 0, edgeOnly = 0, silent = 0, worstSilent = 0;
for (let sd = 0; sd < 40; sd++) {
  const r = G.fineSearch(mk(16, 412.3, -20, 1000 + sd), 412.3 + 3, { dopplerHz: 1200, winChips: 0.5 });
  if (r.edgeHit) edgeOnly++;
  if (r.edgeHit || r.weak) caught++;
  else { silent++; worstSilent = Math.max(worstSilent, Math.abs(wrap(r.chips - 412.3)) * CHIP_M); }
}
H.check('粗值偏 3 chip 时幅度门+edgeHit 抓住 ≥90%（40 种子）', caught >= 36,
  caught + '/40，静默漏掉 ' + silent + (silent ? '（最大 ' + worstSilent.toFixed(0) + ' m）' : ''));
H.check('只用 edgeHit 抓不全 ⇒ 单种子判据是无效判据（记录 ds4.1 的发现）', edgeOnly <= 20,
  '仅 edgeHit = ' + edgeOnly + '/40');
H.check('本振多普勒给错（真值 1200 Hz、给 0）时 weak=true（幅度门也能抓频率错）',
  G.fineSearch(mk(16, 412.3, -20), 412.3, { dopplerHz: 0 }).weak === true &&
  G.fineSearch(mk(16, 412.3, -20), 412.3, { dopplerHz: 1200 }).weak === false);
H.check('正常情形不得误报 edgeHit / weak',
  G.fineSearch(mk(16, 412.3, -20), 412.3, { dopplerHz: 1200 }).edgeHit === false &&
  G.fineSearch(mk(16, 412.3, -20), 412.3, { dopplerHz: 1200 }).weak === false);
const e2 = G.fineSearch(mk(16, 412.3, -20), 412.3, { dopplerHz: 1200 });
const noRef = G.fineSearch(mk(16, 412.3, -20), 412.3, { dopplerHz: 1200, estimator: 'argmax' });
H.check('estimator 开关生效（argmax 是平台左边缘，比中心小半个平台）',
  Math.abs(noRef.chips - 412.3) * CHIP_M > 0 && noRef.chips !== e2.chips,
  'argmax=' + noRef.chips.toFixed(5) + ' centroid=' + e2.chips.toFixed(5));
H.check('offsetChips 折回 ±511.5 且与 chips−coarse 一致',
  [0.4, 412.3, 1022.9].every(t => { const r = G.fineSearch(mk(16, t, -20), (t + 0.2) % 1023, { dopplerHz: 1200 }); return Math.abs(wrap(r.chips - r.coarseChips) - r.offsetChips) < 1e-9 && Math.abs(r.offsetChips) <= 511.5; }));

H.section('与 acquire 的一致性（4 采样/chip）');
const sig4 = mk(4, 412.3, -20), acq = G.acquire(sig4, { dopplerStepHz: 100 });
const fr4 = G.fineSearch(sig4, acq.codePhaseSamples / 4, { dopplerHz: acq.dopplerHz });
H.check('fineSearch 结果与 acquire 的码相位差 ≤ 1 个采样格（0.25 chip）',
  Math.abs(wrap(fr4.chips - acq.codePhaseSamples / 4)) * CHIP_M <= 73.3 + 1e-9,
  'Δ=' + (Math.abs(wrap(fr4.chips - acq.codePhaseSamples / 4)) * CHIP_M).toFixed(1) + 'm');

H.section('端到端：两阶段把冷启动码相位精度提高一个量级');
const e2e = {};
for (const spc of [4, 16, 40]) {
  const errs = [];
  for (const t of TRUTHS.slice(0, 6)) {
    const s4 = mk(4, t, -20, 4242, 1200);
    const a4 = G.acquire(s4, { dopplerStepHz: 100 });
    const coarse = a4.codePhaseSamples / 4;
    if (spc === 4) errs.push(Math.abs(wrap(coarse - t)) * CHIP_M);
    else { const f = G.fineSearch(mk(spc, t, -20, 4242, 1200), coarse, { dopplerHz: a4.dopplerHz }); errs.push(Math.abs(wrap(f.chips - t)) * CHIP_M); }
  }
  e2e[spc] = rms(errs);
}
H.check('两阶段 4+16spc 的 RMS ≤ 4spc 基线的 0.45 倍', e2e[16] <= e2e[4] * 0.45,
  '4spc=' + e2e[4].toFixed(1) + 'm → 16spc=' + e2e[16].toFixed(1) + 'm');
H.check('两阶段 4+40spc 的 RMS ≤ 4spc 基线的 0.25 倍', e2e[40] <= e2e[4] * 0.25,
  '4spc=' + e2e[4].toFixed(1) + 'm → 40spc=' + e2e[40].toFixed(1) + 'm');
H.check('两阶段单调：4 > 16 > 40（真值递减）', e2e[4] > e2e[16] && e2e[16] > e2e[40],
  [4, 16, 40].map(s => s + 'spc=' + e2e[s].toFixed(1) + 'm').join('  '));

H.summary();
