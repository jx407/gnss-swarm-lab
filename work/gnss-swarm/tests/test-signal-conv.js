'use strict';
/* 判据：码相位约定（lib/signal.js）。
 * 背景：本项目里存在两套**镜像**约定，写错会静默退化成"搜噪声"：
 *   - makeSignal/acquire：codePhase 越大 = 码越超前，采样表示 = g·SPC
 *   - correlateAt(sig, s)：s 是复制码延迟，峰在 s = (N − g·SPC) mod N
 * 本判据既正向验证换算函数，也用"错误约定处幅度必须显著更低"反向锁死方向。 */
const H = require('./harness.js');
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ca-code.js', __dirname + '/../winners/acquisition-v2.js');
const FS = 4092000, SPC = FS / 1023e3, N = 1023 * SPC;
const wrapS = s => ((s % N) + N) % N;

H.section('换算函数存在与往返一致');
H.check('chipsToCorrelateOffset/correlateOffsetToChips 已导出',
  typeof G.chipsToCorrelateOffset === 'function' && typeof G.correlateOffsetToChips === 'function');
if (typeof G.chipsToCorrelateOffset !== 'function') H.summary();
let rtMax = 0;
for (const g of [0, 0.3, 412.3, 800.1, 1022.9]) {
  const back = G.correlateOffsetToChips(G.chipsToCorrelateOffset(g, FS), FS);
  rtMax = Math.max(rtMax, Math.abs(back - g));
}
H.check('chips → offset → chips 往返一致（≤1e-9 chip）', rtMax <= 1e-9, 'max=' + rtMax.toExponential(2));
H.check('镜像关系 N − g·SPC（含 0.3 chip 案例）',
  Math.abs(G.chipsToCorrelateOffset(412.3, FS) - (N - 412.3 * SPC)) < 1e-9,
  'got ' + G.chipsToCorrelateOffset(412.3, FS).toFixed(3) + ' expect ' + (N - 412.3 * SPC).toFixed(3));

H.section('无噪信号：峰必须落在镜像位置');
let worstPos = 0, worstRatio = Infinity, worstCase = '', degenerate = null;
for (const g of [0.3, 412.3, 800.1, 1022.9]) {
  const sig = G.makeSignal({ prn: 1, codePhase: g, dopplerHz: 0, snrDb: 60, ms: 2, seed: 11, fs: FS });
  const s0 = G.chipsToCorrelateOffset(g, FS);
  let best = { v: -1, s: 0 };
  for (let d = -4; d <= 4; d++) {
    const s = Math.round(wrapS(s0)) + d;
    const v = G.correlateAt(sig, s, 0, sig.ms);
    if (v > best.v) best = { v: v, s: s };
  }
  const posErr = Math.abs(wrapS(best.s) - wrapS(s0));
  const vWrong = G.correlateAt(sig, Math.round(g * SPC), 0, sig.ms);
  const ratio = vWrong > 0 ? best.v / vWrong : Infinity;
  if (posErr > worstPos) worstPos = posErr;
  /* 注意：g 接近 0 或 1023 时，直读位置与镜像位置本来就重合（码相位在环上回绕），
     此时"错约定处幅度低"不成立，也不该成立——只有远离 0/1023 才有鉴别力。 */
  const dDiff = Math.abs(wrapS(Math.round(g * SPC)) - wrapS(s0));
  if (Math.min(dDiff, N - dDiff) > 4) {
    if (ratio < worstRatio) { worstRatio = ratio; worstCase = 'g=' + g + ' 峰' + best.v.toFixed(0) + ' vs 直读处' + vWrong.toFixed(0); }
  } else if (degenerate === null || dDiff < degenerate) degenerate = dDiff;
}
H.check('峰值位置与镜像公式一致（±1 采样，4 个码相位）', worstPos <= 1, 'max偏移=' + worstPos.toFixed(0) + ' 采样');
H.check('远离 0/1023 时直读位置幅度显著更低（峰/直读 ≥ 3 倍）', worstRatio >= 3, '最小比值=' + worstRatio.toFixed(2) + ' @' + worstCase);
H.check('g≈1023 时两种约定位置确实重合（退化情形，≤4 采样）', degenerate !== null && degenerate <= 4, '相差=' + (degenerate === null ? 'n/a' : degenerate.toFixed(2)) + ' 采样');

H.section('acquire 与 makeSignal 同约定（可直接互转）');
let acqMax = 0;
for (const g of [412.3, 800.1, 1022.9]) {
  const sig = G.makeSignal({ prn: 1, codePhase: g, dopplerHz: 1200, snrDb: -20, ms: 4, seed: 77, fs: FS });
  const r = G.acquire(sig, {});
  const chips = r.codePhaseSamples * 1023 / (FS * 0.001);
  let d = chips - g; while (d > 511.5) d -= 1023; while (d < -511.5) d += 1023;
  acqMax = Math.max(acqMax, Math.abs(d));
}
H.check('acquire 的码相位在 ±0.5 chip 内（生成器约定）', acqMax <= 0.5, 'max=' + acqMax.toFixed(3) + ' chip');
H.section('码相位可观测分辨率（采样率决定的下限）');
/* 同一 PRN 的两个码相位，若采样后的码序列逐样本相同，则任何估计器都无法区分它们。
   C/A 码在每 chip 内取值恒定，所以"不可区分区间"宽度 = 1/SPC chip；4 采样/chip 时
   量化格 = 0.25 chip ≈ 73 m，估计误差下限 ±0.125 chip ≈ ±37 m —— 这正是冷启动面板
   修复精修后残差仍有 ~36 m 的原因（是模型下限，不是算法缺陷）。 */
function plateauRight(g, fs, ms) {
  const spc = fs / 1023e3, n = Math.round(fs * ms / 1000), c = G.caCode(1);
  const seq = gg => { const a = []; for (let j = 0; j < n; j++) a.push(c[((Math.floor(j / spc + gg) % 1023) + 1023) % 1023]); return a; };
  const base = seq(g);
  let w = 0;
  for (let d = 0.005; d < 0.6; d += 0.005) {
    const a = seq(g + d); let same = true;
    for (let j = 0; j < n; j++) { if (a[j] !== base[j]) { same = false; break; } }
    if (!same) break;
    w = d;
  }
  return w;
}
const chipMeters = G.CONST.c / G.CONST.F_CODE;
const w4 = plateauRight(412.3, 4092000, 2), w16 = plateauRight(412.3, 16368000, 2);
H.check('4 采样/chip 下不可区分区间 ≥ 0.10 chip（量化格下限）', w4 >= 0.1, 'w=' + w4.toFixed(3) + ' chip');
H.check('4 采样/chip 的下限对应 ≥ 25 m 误差', w4 * chipMeters >= 25, (w4 * chipMeters).toFixed(1) + ' m');
H.check('16 采样/chip 把不可区分区间压到 ≤ 0.05 chip', w16 <= 0.05, 'w=' + w16.toFixed(3) + ' chip');
H.check('提高采样率确实降低码相位下限（16 > 4 采样）', w16 < w4 / 2, 'w4=' + w4.toFixed(3) + ' w16=' + w16.toFixed(3));
H.summary();
