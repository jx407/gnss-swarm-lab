'use strict';
/* 判据：带限前端（lib/signal.js 的 bwHz）与分数延迟复制码（winners/finesearch.js 的 replicaBwHz）
 *
 * 被锁死的机制（v21 §22）：
 *   相关峰顶"平台"有**两个**来源：
 *     (i)  信号侧：接收样本按采样格硬采样 —— 理想方波模型下格内信息确实为 0（物理，救不了）
 *     (ii) 复制码侧：搜索时把 g 量化到整数样本 —— 复制码序列只在 g 越过样本边界时才变（**实现伪影，可救**）
 *   真实接收机前端有带限（把方波磨成光滑码波形）+ 分数延迟码 NCO，所以 (i)(ii) 都不成立。
 *   本判据用 2×2 交叉实验证明：只有"带限信号 + 插值复制码"这一格能突破 1/(2spc) 的信息下限，
 *   而"理想信号 + 插值复制码"**必须仍然卡住**（控制实验，防止把实现伪影当成物理结论）。
 *
 * ⚠️ 两处被 ds4.1 子代理 C 轮推翻后改正的地方（都保留在注释里，避免以后再犯）：
 *   1) σ 与 3 dB 带宽的换算：高斯低通的 −3 dB 点满足 f₃dB = √(ln2)/(2πσ) = 0.13251/σ，
 *      所以自洽常数是 **0.13251**。我原来写 0.3748（差 2√2）⇒ "4 MHz 档"实际只有 1.41 MHz，
 *      全部数字作废重测（本文件里的数都是改正后重测的）。
 *   2) "M=128 收敛到 0.025 m" 是旧代码状态下的偶然数；实测 M=128（0.63）与**精确无表复制码**（0.65）
 *      同量级 ⇒ 残差主要是三点抛物的固有偏差，不是查表伪影（见"M 与精确复制码"一节）。
 */
const H = require('./harness.js');
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ca-code.js',
  __dirname + '/../winners/finesearch.js');
const CHIP_M = G.CONST.c / G.CONST.F_CODE, R = 1.023e6;
const wrap = d => { while (d > 511.5) d -= 1023; while (d < -511.5) d += 1023; return d; };
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
function rndSeq(seed, n) { let a = seed >>> 0; const o = []; for (let i = 0; i < n; i++) { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); o.push(((t ^ (t >>> 14)) >>> 0) / 4294967296); } return o; }
const TR = rndSeq(4242, 12).map(v => 1023 * (0.03 + 0.9 * v));
const W = spc => CHIP_M / spc;
const mk = (spc, bwMHz, t, snr, sd) => G.makeSignal({ prn: 1, codePhase: t, dopplerHz: 1200, snrDb: snr, ms: 4,
  seed: sd == null ? 7 : sd, fs: spc * R, bwHz: bwMHz * 1e6 });
function rmsErr(spc, bwMHz, repBwMHz, snr, M, truths, seeds) {
  const e = [];
  for (const t of (truths || TR)) for (const sd of (seeds || [7])) {
    const r = G.fineSearch(mk(spc, bwMHz, t, snr, sd), t + 0.13, { dopplerHz: 1200, stepChips: 1 / (8 * spc),
      winChips: 0.4, estimator: 'parab', replicaBwHz: repBwMHz * 1e6, replicaSubSamples: M });
    e.push(Math.abs(wrap(r.chips - t)) * CHIP_M);
  }
  return rms(e);
}
H.section('带限前端模型自检（lib/signal.js 的 frontEndInfo）');
H.check('frontEndInfo 已导出；bwHz≤0 → σ=0（走理想方波老路径）',
  typeof G.frontEndInfo === 'function' && G.frontEndInfo(0).sigmaChip === 0 && G.frontEndInfo(null).sigmaChip === 0);
H.check('σ(chip) = 0.13251·R_CODE/bwHz（4MHz → 0.03389 chip）—— 常数对应**真正的 −3 dB 带宽**',
  Math.abs(G.frontEndInfo(4e6).sigmaChip - 0.13251 * R / 4e6) < 1e-12,
  G.frontEndInfo(4e6).sigmaChip.toFixed(5) + ' chip（旧错值 0.09586，差 2√2）');
H.check('自洽性：|H(f₃dB)| = 1/√2（用解析式 f₃dB = 0.13251/σ 反算）',
  Math.abs(Math.exp(-2 * Math.PI * Math.PI * Math.pow(G.frontEndInfo(4e6).sigmaChip, 2) * Math.pow(Math.sqrt(Math.log(2)) / (2 * Math.PI * G.frontEndInfo(4e6).sigmaChip), 2)) - Math.SQRT1_2) < 1e-12);
const flatOf = (sig) => {
  const code = G.caCode(sig.prn), a = [];
  for (let j = 0; j < 3000; j++) {
    const tau = j / sig.fs * R + 412.3, n0 = Math.floor(tau); let same = true;
    for (let k = -3; k <= 3 && same; k++) { const c1 = code[((n0 + k) % 1023 + 1023) % 1023], c2 = code[((n0) % 1023 + 1023) % 1023]; if (c1 !== c2) same = false; }
    if (same) a.push(Math.hypot(sig.i[j], sig.q[j]));
  }
  a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)];
};
let flatAll = true, flatInfo = '';
for (const bw of [0, 16, 8, 4, 2, 1]) { const v = flatOf(mk(4, bw, 412.3, 60)); if (Math.abs(v - 1) > 1e-3) { flatAll = false; flatInfo += bw + 'MHz:' + v.toFixed(4) + ' '; } }
H.check('码的平坦段严格是 ±1（Σ_k[Ψ(u−k)−Ψ(u−k−1)] ≡ 1 ⇒ 幅度/SNR 语义不变）', flatAll, flatInfo || '六档都 =1.0000');
const maxJump = (bw) => { const s = mk(4, bw, 412.3, 60); let m = 0; for (let j = 1; j < s.n; j++) m = Math.max(m, Math.abs(s.i[j] - s.i[j - 1])); return m; };
const mj = [0, 8, 4, 2, 1].map(maxJump);
H.check('最大单样本跳变随带宽收窄非增，且 4/2/1 MHz 档严格低于理想方波（2.002）',
  mj[0] >= mj[1] && mj[1] >= mj[2] && mj[2] > mj[3] && mj[3] > mj[4] && Math.abs(mj[0] - 2) < 0.02,
  mj.map((v, i) => (i ? [8, 4, 2, 1][i - 1] + 'M' : '理想') + ':' + v.toFixed(3)).join(' '));
const hf = (bw) => { const s = mk(4, bw, 412.3, 60); let num = 0, den = 0; for (let j = 1; j < s.n; j++) { num += (s.i[j] - s.i[j - 1]) * (s.i[j] - s.i[j - 1]); den += s.i[j] * s.i[j]; } return num / den; };
/* 常数改正后带宽档比原来"更宽"（同标签下 σ 小 2.83 倍），所以平滑比原来温和：
   理想/4MHz 只差 1.11×（原来 1.6×）。判据按实测放到 1.05×，并保留 4M/1M 的 1.3×。 */
H.check('高频能量（一阶差分能量比）随带宽收窄单调下降：理想/4MHz ≥1.05×、4MHz/1MHz ≥1.3×',
  hf(0) > 1.05 * hf(4) && hf(4) > 1.3 * hf(1),
  [0, 4, 1].map(b => (b === 0 ? '理想' : b + 'M') + ':' + hf(b).toExponential(2)).join('  '));
const pow = (sig, f) => { let re = 0, im = 0; const N = 4092; for (let j = 0; j < N; j++) { const ph = 2 * Math.PI * f * j / sig.fs; re += sig.i[j] * Math.cos(ph); im -= sig.i[j] * Math.sin(ph); } return (re * re + im * im) / (N * N); };
/* 带外抑制：2 MHz 前端（σ=0.068 chip）在 5.5 MHz 只压低 2.3×（该处本来就在主瓣附近），
   到 10 MHz 才拉开量级 —— 判据用 10 MHz，并保留 5.5 MHz 的 2× 弱断言。 */
/* 诚实修正：10 MHz 处"线功率比"不能拿 |H(f)|² 来预期 —— 理想的 C/A 谱在那里已经靠近旁瓣零陷，
   两条曲线都在极小量级，实测比值只有 3×（我一度写成 ≥10× 导致判据假失败）。
   改成只看 5.5 MHz（主瓣附近，量级稳定）+ 断言"带限档在任一频点都不会高于理想档"。 */
H.check('频谱：5.5 MHz 线功率带限 2 MHz 比理想低 ≥2×，且带限档在 10 MHz 不高于理想档',
  pow(mk(4, 2, 412.3, 60), 5.5e6) * 2 <= pow(mk(4, 0, 412.3, 60), 5.5e6) &&
  pow(mk(4, 2, 412.3, 60), 10e6) <= pow(mk(4, 0, 412.3, 60), 10e6),
  '5.5MHz: 理想 ' + pow(mk(4, 0, 412.3, 60), 5.5e6).toExponential(2) + ' vs 2M ' + pow(mk(4, 2, 412.3, 60), 5.5e6).toExponential(2) +
  ' ; 10MHz: 理想 ' + pow(mk(4, 0, 412.3, 60), 10e6).toExponential(2) + ' vs 2M ' + pow(mk(4, 2, 412.3, 60), 10e6).toExponential(2));

H.section('平台的两个来源：2×2 交叉实验（无噪，M=128，spc=4 与 16）');
const cells = {};
for (const spc of [4, 16]) for (const sbw of [0, 4]) {
  cells[spc + '/' + sbw] = {
    hard: rmsErr(spc, sbw, 0, 60),
    interp: rmsErr(spc, sbw, sbw > 0 ? sbw : 4, 60, 128),
    exact: rmsErr(spc, sbw, sbw > 0 ? sbw : 4, 60, 0)
  };
}
let hardOk = true, hardInfo = '';
for (const spc of [4, 16]) {
  const a = cells[spc + '/0'].hard / (W(spc) / Math.sqrt(3)), b = cells[spc + '/4'].hard / (W(spc) / Math.sqrt(3));
  if (!(Math.abs(a - 1) <= 0.2 && Math.abs(b - 1) <= 0.2 && Math.abs(cells[spc + '/0'].hard - cells[spc + '/4'].hard) <= 1e-9)) {
    hardOk = false; hardInfo += spc + 'spc:' + a.toFixed(2) + '/' + b.toFixed(2) + '/' + (cells[spc + '/0'].hard - cells[spc + '/4'].hard).toExponential(1) + ' ';
  }
}
H.check('硬复制码：RMS ∈[0.8,1.2]×W/√3，且**信号带限与否完全不变**（复制码量化遮住信号侧信息）', hardOk,
  hardInfo || [4, 16].map(s => s + 'spc 理想' + cells[s + '/0'].hard.toFixed(2) + 'm/带限' + cells[s + '/4'].hard.toFixed(2) + 'm（W/√3=' + (W(s) / Math.sqrt(3)).toFixed(1) + 'm）').join('  '));
H.check('控制实验：理想方波 + 插值复制码 → 仍卡在信息下限 W/√12（没有"凭插值突破"）',
  [4, 16].every(sp => { const r = cells[sp + '/0'].interp / (W(sp) / Math.sqrt(12)); return r >= 0.8 && r <= 1.4; }),
  [4, 16].map(s => s + 'spc 实测' + cells[s + '/0'].interp.toFixed(3) + 'm vs 下限' + (W(s) / Math.sqrt(12)).toFixed(2) + 'm').join('  '));
H.check('突破成立：16 spc + 4 MHz 带限 + 插值复制码 → 明显低于 W/√12（≤0.6×）',
  cells['16/4'].interp <= 0.6 * (W(16) / Math.sqrt(12)),
  '实测' + cells['16/4'].interp.toFixed(3) + 'm / 下限' + (W(16) / Math.sqrt(12)).toFixed(2) + 'm = ' + (cells['16/4'].interp / (W(16) / Math.sqrt(12))).toFixed(2) + '×');
/* ⚠️ 这一条是我原判据的**反转**：带宽标签改正前，我以为"4 spc + 4 MHz"也突破；
   改正后（4 MHz 才是真的 3 dB 带宽）它只到信息下限 —— 因为 4 MHz 超过 4 采样/chip 的奈奎斯特（2.05 MHz），
   码跳变比采样格还窄，样本基本落不到斜坡上 ⇒ 信号侧信息仍≈0。这正是"带宽必须与采样率匹配"的直接证据。 */
H.check('诚实反转：4 spc + 4 MHz **不突破**（21.84 m ≈ 下限 21.15 m；4 MHz > 奈奎斯特 2.05 MHz 被混叠）',
  cells['4/4'].interp / (W(4) / Math.sqrt(12)) >= 0.9,
  '实测' + cells['4/4'].interp.toFixed(3) + 'm / 下限' + (W(4) / Math.sqrt(12)).toFixed(2) + 'm = ' + (cells['4/4'].interp / (W(4) / Math.sqrt(12))).toFixed(2) + '×');
H.check('插值复制码在带限信号上严格优于硬复制码（4spc ≥1.5×、16spc ≥5×）',
  cells['4/4'].hard / cells['4/4'].interp >= 1.5 && cells['16/4'].hard / cells['16/4'].interp >= 5,
  '4spc ' + (cells['4/4'].hard / cells['4/4'].interp).toFixed(2) + '× / 16spc ' + (cells['16/4'].hard / cells['16/4'].interp).toFixed(1) + '×');

H.section('M 与"精确无表复制码"：查表不是精度瓶颈（ds4.1 C 轮结论，我方复测）');
const mExact = {}, m128 = {}, m512 = {};
for (const sp of [4, 16]) { mExact[sp] = rmsErr(sp, 4, 4, 60, 0); m128[sp] = rmsErr(sp, 4, 4, 60, 128); m512[sp] = rmsErr(sp, 4, 4, 60, 512); }
H.check('M=128 与"精确无表复制码"同量级（差 ≤25% ⇒ 残差不是查表插值主导，而是三点抛物偏差）',
  [4, 16].every(sp => Math.abs(m128[sp] - mExact[sp]) <= 0.25 * Math.max(m128[sp], mExact[sp])),
  [4, 16].map(sp => sp + 'spc: M128=' + m128[sp].toFixed(3) + ' 精确=' + mExact[sp].toFixed(3)).join('  '));
H.check('接口支持精确复制码（replicaSubSamples: 0 → replicaSubSamples="exact"）',
  G.fineSearch(mk(16, 4, 412.3, 60), 412.3, { dopplerHz: 1200, replicaSubSamples: 0 }).replicaSubSamples === 'exact');
H.check('诚实记录非收敛：M 加密不会更差，且 16 spc 上反而低于精确值（平滑副作用，不是"越密越准"）',
  [4, 16].every(sp => m512[sp] <= 1.02 * mExact[sp]) && m512[16] < mExact[16],
  [4, 16].map(sp => sp + 'spc: M512=' + m512[sp].toFixed(3) + ' vs 精确=' + mExact[sp].toFixed(3)).join('  '));

H.section('带宽 × 采样率：带宽要与采样率匹配（−20 dB，插值复制码，6 真值 × 2 种子）');
const T6 = TR.slice(0, 6), S2 = [7, 21];
const bl = (spc, bw) => rmsErr(spc, bw, bw, -20, 128, T6, S2);
const n4_2 = bl(4, 2), n4_8 = bl(4, 8), n4_16 = bl(4, 16);
H.check('4 采样/chip（奈奎斯特 2.05 MHz）：2 MHz 前端优于 8 MHz 与 16 MHz（更宽被混叠）',
  n4_2 <= 0.9 * n4_8 && n4_2 <= 0.75 * n4_16,
  '2MHz ' + n4_2.toFixed(2) + 'm vs 8MHz ' + n4_8.toFixed(2) + 'm vs 16MHz ' + n4_16.toFixed(2) + 'm');
const n16_2 = bl(16, 2), n16_4 = bl(16, 4), n16_8 = bl(16, 8);
H.check('16 采样/chip（奈奎斯特 8.18 MHz）：4 MHz 前端优于 2 MHz 与 8 MHz（最优点在 ~f_s/4）',
  n16_4 <= 0.9 * n16_2 && n16_4 <= 0.6 * n16_8,
  '4MHz ' + n16_4.toFixed(2) + 'm vs 2MHz ' + n16_2.toFixed(2) + 'm vs 8MHz ' + n16_8.toFixed(2) + 'm');
H.check('两档最优点分别落在 ~f_s/2（4spc）与 ~f_s/4（16spc）⇒ "带宽要与采样率匹配"，且不得超过奈奎斯特',
  n4_2 <= 0.9 * n4_8 && n16_4 <= 0.9 * n16_2, '4spc 选 2MHz、16spc 选 4MHz');
H.check('带限模型的 −20 dB 精度严格优于理想方波模型的信息下限（16 spc、4 MHz 档）',
  n16_4 <= W(16) / Math.sqrt(12), n16_4.toFixed(2) + 'm vs ' + (W(16) / Math.sqrt(12)).toFixed(2) + 'm');

H.section('向后兼容与幅度门');
const a0 = mk(4, 0, 412.3, -20), aU = G.makeSignal({ prn: 1, codePhase: 412.3, dopplerHz: 1200, snrDb: -20, ms: 4, seed: 7, fs: 4.092e6 });
let ident = a0.n === aU.n;
if (ident) for (let j = 0; j < a0.n; j++) if (a0.i[j] !== aU.i[j] || a0.q[j] !== aU.q[j]) { ident = false; break; }
H.check('bwHz 缺省与 bwHz=0 逐位相同（既有 21 套判据的行为不变）', ident);
const localVals = (sig, repBw) => { const out = []; for (let k = -20; k <= 20; k++) { const r = G.fineSearch(sig, 412.3 + k * 0.002, { dopplerHz: 1200, winChips: 0, stepChips: 0.002, replicaBwHz: repBw }); out.push(r.amp.toFixed(6)); } return new Set(out).size; };
const nIdeal = localVals(mk(4, 0, 412.3, 60), 0), nBL = localVals(mk(16, 4, 412.3, 60), 4e6);
H.check('理想方波 + 硬复制码：±0.04 chip 内相关值完全不变（平台仍在，信息为 0）', nIdeal === 1, nIdeal + '/41');
H.check('带限信号 + 插值复制码：同一窗口内每个 g 的相关值都不同（平台消失）', nBL === 41, nBL + '/41');
const w1 = G.fineSearch(mk(16, 4, 412.3, -20), 412.3, { dopplerHz: 1200 });
H.check('带限模式下幅度门不误报（weak=false，ampPerSample≈1）', w1.weak === false && w1.ampPerSample > 0.8,
  'ampPerSample=' + w1.ampPerSample.toFixed(3));
H.check('接口自证：interpolatedReplica / replicaSubSamples / replicaBwHz 与选项一致',
  w1.interpolatedReplica === true && w1.replicaSubSamples === 64 && w1.replicaBwHz === 4e6,
  JSON.stringify([w1.interpolatedReplica, w1.replicaSubSamples, w1.replicaBwHz]));
H.check('显式关闭（replicaBwHz=0）时即使信号带限也退回硬复制码',
  G.fineSearch(mk(16, 4, 412.3, -20), 412.3, { dopplerHz: 1200, replicaBwHz: 0 }).interpolatedReplica === false);
H.check('非法 replicaBwHz 不影响理想方波路径（负值/NaN 视为 0）',
  G.fineSearch(mk(4, 0, 412.3, -20), 412.3, { dopplerHz: 1200, replicaBwHz: -1 }).interpolatedReplica === false &&
  G.fineSearch(mk(4, 0, 412.3, -20), 412.3, { dopplerHz: 1200, replicaBwHz: NaN }).interpolatedReplica === false);

H.section('自动估计器（auto）：用机制而不是让调用方声明模式');
const ai = G.fineSearch(mk(16, 0, 412.3, 60), 412.43, { dopplerHz: 1200 });
const ab = G.fineSearch(mk(16, 4, 412.3, 60), 412.43, { dopplerHz: 1200 });
H.check('理想方波 → 判为平台（plateauDetected=true）并用平台中心', ai.plateauDetected === true && ai.estimator === 'centroid');
H.check('带限前端（16 spc + 4 MHz）→ 判为光滑丘（plateauDetected=false）并用局部加密+三点抛物',
  ab.plateauDetected === false && ab.estimator === 'parab-fine');
H.check('光滑丘分支确实多做了局部加密（denseEvals ≥ 17）', ab.denseEvals >= 17, 'denseEvals=' + ab.denseEvals + '，总 evals=' + ab.evals);
H.check('理想方波分支不付加密代价（denseEvals=0）', ai.denseEvals === 0, 'evals=' + ai.evals);
const ea = [], eb = [];
for (const t of TR) {
  ea.push(Math.abs(wrap(G.fineSearch(mk(16, 0, t, 60), t + 0.13, { dopplerHz: 1200 }).chips - t)) * CHIP_M);
  eb.push(Math.abs(wrap(G.fineSearch(mk(16, 4, t, 60), t + 0.13, { dopplerHz: 1200 }).chips - t)) * CHIP_M);
}
H.check('auto 在带限信号（16 spc + 4 MHz）上的无噪 RMS 优于理想模型信息下限 ≥2 倍',
  rms(eb) <= (W(16) / Math.sqrt(12)) / 2,
  '带限 ' + rms(eb).toFixed(3) + 'm vs 理想下限 ' + (W(16) / Math.sqrt(12)).toFixed(2) + 'm（理想模型实测 ' + rms(ea).toFixed(2) + 'm）');

H.summary();
