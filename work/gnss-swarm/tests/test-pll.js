'use strict';
/* 判据：Costas 载波跟踪环 GNSS.pllTrack + 基元 GNSS.correlateIQ（CONTRACT-v10.md §16） */
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-pll.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ca-code.js', target);
const FS = 4092000, CP = 412.3, OFF = G.chipsToCorrelateOffset(CP, FS), F_TRUE = 1200, N = 40, DT = 0.005, SNR_DB = -20;
const wrapPi = x => Math.atan2(Math.sin(x), Math.cos(x));
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

/* 真值相位轨迹只留在测试这边；信号对象里的 carrierPhaseRad 会被改成假值（防作弊） */
function truthOf(kind, n) {
  const a = [];
  for (let e = 0; e < n; e++) {
    if (kind === 'static') a.push(0.7);
    else if (kind === 'ramp') a.push(0.7 + 2 * Math.PI * 2 * DT * e);                 /* 残余多普勒 2 Hz */
    else if (kind === 'rate') a.push(0.7 + 2 * Math.PI * 2 * DT * e + 0.5 * 0.002 * e * e);
    else if (kind === 'pullin') a.push(2.2);
    else throw new Error('unknown kind ' + kind);
  }
  return a;
}
function makeEpochs(kind, opts) {
  opts = opts || {};
  const truth = truthOf(kind, opts.n || N);
  const epochs = truth.map((t, e) => {
    const sig = G.makeSignal({ prn: 1, codePhase: CP, dopplerHz: F_TRUE, carrierPhaseRad: t,
      snrDb: opts.snrDb == null ? SNR_DB : opts.snrDb, ms: 4, seed: (opts.seed || 5) * 31 + e, fs: FS });
    sig.carrierPhaseRad = 999;                     /* 防作弊：真值字段写假 */
    return { t: DT, sig: sig };
  });
  return { epochs: epochs, truth: truth };
}
/* 指定真值轨迹建历元（用于数据位翻转等特殊场景） */
function makeEpochsTruth(truth, opts) {
  opts = opts || {};
  const epochs = truth.map((t, e) => {
    const sig = G.makeSignal({ prn: 1, codePhase: CP, dopplerHz: F_TRUE, carrierPhaseRad: t,
      snrDb: opts.snrDb == null ? SNR_DB : opts.snrDb, ms: 4, seed: (opts.seed || 5) * 31 + e, fs: FS });
    sig.carrierPhaseRad = 999;
    return { t: DT, sig: sig };
  });
  return { epochs: epochs, truth: truth };
}
/* 本历元实际用到的本振相位（首历元用 phi0） */
function appliedPhase(r, phi0) {
  return r.phase.map((p, e) => (e === 0 ? (isFinite(phi0) ? phi0 : 0) : r.phase[e - 1]));
}
function runPll(kind, o) {
  const built = makeEpochs(kind, o);
  const pllOpts = (o && o.pll) ? o.pll : {};
  const r = G.pllTrack(built.epochs, pllOpts);
  const phi0 = isFinite(pllOpts.phi0) ? pllOpts.phi0 : 0;
  /* 物理上有意义的误差 = 真值 − 本历元**实际用到**的本振相位（= 上一历元的环路输出）。
     若拿 phase[e]（本历元更新之后的值）去比，等于用未来信息评分，会系统性偏乐观。 */
  const errsUsed = r.phase.map((p, e) => wrapPi(built.truth[e] - (e === 0 ? phi0 : r.phase[e - 1])));
  const errsPost = r.phase.map((p, e) => wrapPi(built.truth[e] - p));
  return { r: r, errs: errsUsed, errsUsed: errsUsed, errsPost: errsPost, truth: built.truth };
}

H.section('基元 correlateIQ：I/Q 语义与相位方向');
H.check('correlateIQ 已导出', typeof G.correlateIQ === 'function');
{
  const s = G.makeSignal({ prn: 1, codePhase: CP, dopplerHz: F_TRUE, carrierPhaseRad: 0.3, snrDb: 60, ms: 4, seed: 3, fs: FS });
  const match = G.correlateIQ(s, OFF, F_TRUE, 0.3, s.ms);
  H.check('本振与信号完全匹配：I 为正、|Q| ≪ I',
    match.I > 0 && Math.abs(match.Q) < 0.1 * match.I, 'I=' + match.I.toFixed(0) + ' Q=' + match.Q.toFixed(0));
  const rot = G.correlateIQ(s, OFF, F_TRUE, 0.3 + Math.PI / 2, s.ms);
  H.check('本振相位超前 +π/2：Q 为负且主导（残差 = φ−θ）',
    rot.Q < -0.9 * rot.amp && Math.abs(rot.I) < 0.1 * rot.amp, 'I=' + rot.I.toFixed(0) + ' Q=' + rot.Q.toFixed(0));
  const off = G.correlateIQ(s, OFF, F_TRUE + 250, 0.3, s.ms);
  H.check('本振频率偏 250 Hz（4 ms 积分）：幅度显著衰减', off.amp < 0.6 * match.amp,
    'amp ' + match.amp.toFixed(0) + ' → ' + off.amp.toFixed(0));
}

H.section('接口');
H.check('pllTrack 存在', typeof G.pllTrack === 'function');
if (typeof G.pllTrack !== 'function') H.summary();
const st0 = runPll('static', { pll: { codeChips: CP, fNco0: F_TRUE } });
H.check('返回 { phase, freq, disc, locked } 且长度 = 历元数',
  st0.r && Array.isArray(st0.r.phase) && st0.r.phase.length === N && st0.r.freq.length === N && st0.r.disc.length === N && typeof st0.r.locked === 'boolean');
H.check('输出全为有限数', st0.r.phase.concat(st0.r.freq, st0.r.disc).every(isFinite));

H.section('静态载波相位（φ=0.7 rad，snrDb=−20 dB）');
{
  const seg = st0.errs.slice(20);
  H.check('后 20 历元平均误差 |mean| ≤ 0.10 rad', Math.abs(mean(seg)) <= 0.10, mean(seg).toFixed(4) + ' rad');
  H.check('后 20 历元抖动 rms ≤ 0.15 rad', rms(seg) <= 0.15, rms(seg).toFixed(4) + ' rad');
  H.check('末历元 |误差| ≤ 0.15 rad', Math.abs(st0.errs[N - 1]) <= 0.15, st0.errs[N - 1].toFixed(4) + ' rad');
  H.check('locked=true', st0.r.locked === true);
}

H.section('前提：本振频率必须由捕获给出');
{
  /* 信号多普勒 1200 Hz；若本振从 0 Hz 起（相当于没做捕获），4 ms 内载波转 4.8 圈，
     相关对消 → 环路无从锁定。这是"先捕获、后跟踪"的硬约束。 */
  const noNco = runPll('static', { pll: { codeChips: CP } });
  const ok = Math.abs(mean(noNco.errs.slice(20))) <= 0.1;
  console.log('  [实测] 不给 fNco0 时后 20 历元平均误差=' + mean(noNco.errs.slice(20)).toFixed(3) +
    ' rad，locked=' + noNco.r.locked);
  H.check('不给本振初值（无捕获多普勒）时锁不住——判据必须用它作为前提', !ok,
    '误差 ' + mean(noNco.errs.slice(20)).toFixed(3) + ' rad');
}

H.section('动态：恒定残余多普勒 2 Hz（0.0628 rad/历元）');
{
  const two = runPll('ramp', { pll: { codeChips: CP, fNco0: F_TRUE } });
  const one = runPll('ramp', { pll: { codeChips: CP, fNco0: F_TRUE, beta: 0, alpha: 0.15 } });
  const m2 = mean(two.errs.slice(20)), m1 = mean(one.errs.slice(20));
  console.log('  [实测] 二阶 α=0.4/β=0.02 稳态滞后=' + m2.toFixed(4) + ' rad；一阶 α=0.15/β=0 滞后=' + m1.toFixed(4) + ' rad');
  H.check('二阶环稳态滞后 |mean| ≤ 0.05 rad（积分项把匀速滞后压到零）', Math.abs(m2) <= 0.05, m2.toFixed(4) + ' rad');
  H.check('一阶环确有稳态滞后，且 ≥5 倍于二阶环', Math.abs(m1) >= 5 * Math.abs(m2),
    '一阶 ' + m1.toFixed(3) + ' rad vs 二阶 ' + m2.toFixed(3) + ' rad');
  H.check('一阶滞后与 2πf·dt/α 同量级（0.2–1.0 rad）',
    Math.abs(m1) >= 0.2 && Math.abs(m1) <= 1.0, Math.abs(m1).toFixed(3) + ' rad，理论 ' + (2 * Math.PI * 2 * DT / 0.15).toFixed(3));
  H.check('残余频差输出收敛到 2 Hz（后 20 历元均值 ±0.5 Hz）',
    Math.abs(mean(two.r.freq.slice(20)) - 2) <= 0.5, mean(two.r.freq.slice(20)).toFixed(3) + ' Hz');
}

H.section('多普勒变化率与牵入');
{
  const rate = runPll('rate', { pll: { codeChips: CP, fNco0: F_TRUE } });
  const rate1 = runPll('rate', { pll: { codeChips: CP, fNco0: F_TRUE, beta: 0, alpha: 0.15 } });
  const mr = mean(rate.errs.slice(20)), mr1 = mean(rate1.errs.slice(20));
  console.log('  [实测] 多普勒变化率 0.002 rad/历元²：二阶滞后=' + mr.toFixed(3) + ' rad，一阶=' + mr1.toFixed(3) + ' rad');
  H.check('二阶环对多普勒变化率的稳态滞后 ≤ 0.25 rad', Math.abs(mr) <= 0.25, mr.toFixed(3) + ' rad');
  H.check('同一场景一阶环明显更差（≥3 倍）', Math.abs(mr1) >= 3 * Math.abs(mr),
    '一阶 ' + mr1.toFixed(3) + ' vs 二阶 ' + mr.toFixed(3));
  const pull = runPll('pullin', { pll: { codeChips: CP, fNco0: F_TRUE } });
  H.check('初相偏 1.5 rad 能牵入（末历元 |误差| ≤ 0.2 rad）', Math.abs(pull.errs[N - 1]) <= 0.2, pull.errs[N - 1].toFixed(3) + ' rad');
  H.check('牵入过程 locked=true', pull.r.locked === true);
  H.check('防作弊：真值字段写成 999 时仍能锁定（实现没读它）', Math.abs(pull.errs[N - 1]) <= 0.2);
}

H.section('鉴别器：Costas 免疫 180° 数据位翻转，atan2 不免疫');
{
  const flipTruth = [];
  for (let e = 0; e < N; e++) flipTruth.push(e >= 20 ? Math.PI : 0);   /* 第 20 历元导航电文比特翻转 */
  const built = makeEpochsTruth(flipTruth, {});
  const at = G.pllTrack(built.epochs, { codeChips: CP, fNco0: F_TRUE });
  const co = G.pllTrack(built.epochs, { codeChips: CP, fNco0: F_TRUE, disc: 'costas' });
  const pa = appliedPhase(at).slice(25), pc = appliedPhase(co).slice(25);
  const maxAbs = a => Math.max.apply(null, a.map(Math.abs));
  console.log('  [实测] 翻转后本振相位：atan2 max|φ|=' + maxAbs(pa).toFixed(3) +
    ' rad；costas max|φ|=' + maxAbs(pc).toFixed(3) + ' rad');
  H.check('costas：翻转后本振相位保持连续（max|φ| ≤ 0.25 rad，即不跟数据位跑）', maxAbs(pc) <= 0.25, maxAbs(pc).toFixed(3) + ' rad');
  H.check('atan2：同一翻转下被踢走（max|φ| ≥ 1.5 rad）——说明它不是 Costas 鉴相', maxAbs(pa) >= 1.5, maxAbs(pa).toFixed(3) + ' rad');
  H.check('costas 在翻转场景仍报告 locked', co.locked === true);
  /* 无噪小误差标定：两种鉴相器在小误差下都应 ≈ 偏移 */
  const sigCal = G.makeSignal({ prn: 1, codePhase: CP, dopplerHz: F_TRUE, carrierPhaseRad: 0.2, snrDb: 60, ms: 4, seed: 1, fs: FS });
  const sCal = [{ t: DT, sig: sigCal }];
  const rA = G.pllTrack(sCal, { codeChips: CP, fNco0: F_TRUE });
  const rC = G.pllTrack(sCal, { codeChips: CP, fNco0: F_TRUE, disc: 'costas' });
  H.check('小误差（0.2 rad）下两种鉴相器输出都 ≈ 0.2（±0.05）',
    Math.abs(rA.disc[0] - 0.2) <= 0.05 && Math.abs(rC.disc[0] - 0.2) <= 0.05,
    'atan=' + rA.disc[0].toFixed(4) + ' costas=' + rC.disc[0].toFixed(4));
}


H.section('逐历元码相位（跟踪态必需）');
{
  /* 码相位每历元漂 0.27 chip：固定锚点 4 个历元后就超出 ±1 chip，相关≈0 */
  const DRIFT = 0.27, NP = 40;
  const driftChips = [];
  for (let e = 0; e < NP; e++) driftChips.push(CP + DRIFT * e);
  const sigs = driftChips.map((cp, e) => {
    const sig = G.makeSignal({ prn: 1, codePhase: cp, dopplerHz: F_TRUE, carrierPhaseRad: 0.7,
      snrDb: SNR_DB, ms: 4, seed: 4242 + e * 17, fs: FS });
    sig.carrierPhaseRad = 999;
    return { t: DT, sig: sig, codeChips: cp };
  });
  const perEpoch = G.pllTrack(sigs, { fNco0: F_TRUE });
  const errsUsed = perEpoch.phase.map((p, e) => wrapPi(0.7 - (e === 0 ? 0 : perEpoch.phase[e - 1])));
  const steady = errsUsed.slice(20);
  const meanAbs = steady.reduce((a, b) => a + Math.abs(b), 0) / steady.length;
  console.log('  [实测] 逐历元码相位：稳态 |误差| 均值=' + meanAbs.toFixed(4) + ' rad，locked=' + perEpoch.locked);
  H.check('逐历元码相位下环路锁定（稳态 |误差| ≤ 0.1 rad）', meanAbs <= 0.1, meanAbs.toFixed(4) + ' rad');
  H.check('逐历元码相位下 locked = true', perEpoch.locked === true);
  const fixedOnly = G.pllTrack(sigs.map(s => ({ t: s.t, sig: s.sig })), { codeChips: CP, fNco0: F_TRUE });
  const fx = fixedOnly.phase.map((p, e) => wrapPi(0.7 - (e === 0 ? 0 : fixedOnly.phase[e - 1])));
  const fxMean = fx.slice(20).reduce((a, b) => a + Math.abs(b), 0) / fx.slice(20).length;
  console.log('  [实测] 只用固定码相位：稳态 |误差| 均值=' + fxMean.toFixed(4) + ' rad，locked=' + fixedOnly.locked);
  H.check('同一信号只给固定锚点则锁不住（|误差| ≥ 0.5 rad 或未锁定）',
    fxMean >= 0.5 || fixedOnly.locked === false, fxMean.toFixed(3) + ' rad, locked=' + fixedOnly.locked);
  /* 两种都给：以逐历元为准 */
  const biased = sigs.map((s, e) => ({ t: s.t, sig: s.sig, codeChips: CP + 3 + DRIFT * e }));
  const both = G.pllTrack(biased, { codeChips: CP, fNco0: F_TRUE });
  const bErr = both.phase.map((p, e) => wrapPi(0.7 - (e === 0 ? 0 : both.phase[e - 1])));
  const bMean = bErr.slice(20).reduce((a, b) => a + Math.abs(b), 0) / bErr.slice(20).length;
  H.check('同时给两种码相位时以逐历元为准（偏值导致锁不住，说明没被 opts 覆盖）',
    bMean >= 0.5 || both.locked === false, bMean.toFixed(3) + ' rad, locked=' + both.locked);
}


H.section('锁定判据（v14）：失锁与正交假锁必须被识别');
{
  /* ① 正常跟踪时 lockQual ≈ 1、locked = true（原判据已覆盖，这里同时查 lockQual） */
  const okRun = runPll('static', { pll: { codeChips: CP, fNco0: F_TRUE } });
  H.check('正常跟踪：locked = true 且 lockQual ≥ 0.9', okRun.r.locked === true && okRun.r.lockQual >= 0.9,
    'lockQual=' + (okRun.r.lockQual == null ? 'n/a' : okRun.r.lockQual.toFixed(4)));
  /* ② 码相位完全失配（prompt 退化为噪声）：costas 的 |d| 恒 ≤0.5，旧判据会误报 locked=true */
  const sigsBad = makeEpochsTruth(new Array(N).fill(0.7), {}).epochs.map((ep, e) => ({ t: DT, sig: ep.sig, codeChips: CP + 300 }));
  for (const disc of ['costas', 'atan']) {
    const bad = G.pllTrack(sigsBad, { fNco0: F_TRUE, disc: disc });
    H.check('码相位失配（' + disc + '）：locked = false', bad.locked === false,
      'locked=' + bad.locked + ', lockQual=' + (bad.lockQual == null ? 'n/a' : bad.lockQual.toFixed(3)) + ', disc[0]=' + (isFinite(bad.disc[0]) ? bad.disc[0].toFixed(3) : 'NaN'));
  }
  /* ③ 无信号 / 极弱信号：I/Q 退化为噪声 → lockQual ≈ 0.64 或 0 → locked = false
     （注：正交零点 Δφ=±π/2 对归一化 Costas 是**不稳定**平衡，环路会自行逃逸到 0/π 的真实锁点，
       所以这里不需要、也不应该用"正交假锁"作为反例。） */
  const noSig = G.makeSignal({ prn: 1, codePhase: CP, dopplerHz: F_TRUE, carrierPhaseRad: 0.7, amp: 0, snrDb: -20, ms: 4, seed: 5, fs: FS });
  const rNoSig = G.pllTrack(new Array(N).fill(0).map(() => ({ t: DT, sig: noSig, codeChips: CP })), { fNco0: F_TRUE, disc: 'costas' });
  H.check('无信号（幅度 0）：locked = false 且 lockQual = 0', rNoSig.locked === false && rNoSig.lockQual === 0,
    'lockQual=' + rNoSig.lockQual + ' locked=' + rNoSig.locked);
  const weak = makeEpochsTruth(new Array(N).fill(0.7), { snrDb: -45 }).epochs;
  const rWeak = G.pllTrack(weak, { codeNhips: undefined, codeChips: CP, fNco0: F_TRUE, disc: 'costas' });
  H.check('极弱信号（后相关 SNR ≈ −3 dB）：locked = false（lockQual < 0.8）',
    rWeak.locked === false, 'lockQual=' + (rWeak.lockQual == null ? 'n/a' : rWeak.lockQual.toFixed(3)) + ' locked=' + rWeak.locked);
}


H.section('freq 的语义：混叠后的绝对多普勒（不是"相对 f0 的残余"）');
{
  /* 细块 4 ms ⇒ 每块相位推进 2πf·0.004，只能观测到 mod 2π ⇒ 模糊步长 1/0.004 = 250 Hz。
     决定性实验：dop = 800 Hz（混叠量 wrap125 = +50 Hz），f0 ∈ {700,800,900}
     → 若 freq 是"残余"，应分别给 +100 / 0 / −100；实测应恒为 ≈ +50。 */
  function runAlias(dop, f0, nBlk) {
    const eps = [];
    for (let e = 0; e < nBlk; e++) {
      const t = e * 0.004;
      const sig = G.makeSignal({ prn: 1, codePhase: CP, dopplerHz: dop, carrierPhaseRad: 2 * Math.PI * dop * t,
        snrDb: SNR_DB, ms: 4, seed: 31 + e, fs: FS });
      sig.carrierPhaseRad = 999;
      eps.push({ t: 0.004, sig: sig, codeChips: CP });
    }
    const r = G.pllTrack(eps, { fNco0: f0, disc: 'atan', alpha: 0.8, beta: 0.08 });
    const tail = r.freq.slice(-40).filter(isFinite).sort((a, b) => a - b);
    return { r: r, fMed: tail[Math.floor(tail.length / 2)] };
  }
  const aliasTable = [];
  for (const f0 of [700, 800, 900]) {
    const o = runAlias(800, f0, 200);
    aliasTable.push({ f0: f0, fMed: o.fMed, locked: o.r.locked, lockQual: o.r.lockQual });
  }
  console.log('  [实测] dop=800（混叠 +50 Hz）：' + aliasTable.map(o => 'f0=' + o.f0 + '→freq ' + o.fMed.toFixed(2)).join('，'));
  H.check('freq 给出的是混叠绝对量（三个 f0 都 ≈ +50 Hz，±5）',
    aliasTable.every(o => Math.abs(o.fMed - 50) <= 5), aliasTable.map(o => o.fMed.toFixed(2)).join(','));
  H.check('freq 不是残余频差（与 f_true−f0 = +100/0/−100 差 ≥30 Hz）',
    aliasTable.every((o, i) => Math.abs(o.fMed - (800 - o.f0)) >= 30), '残余应为 +100/0/-100');
  H.check('该场景三个 f0 都能锁定（dop=800 的混叠量只有 50 Hz，在牵引范围内）',
    aliasTable.every(o => o.locked === true && o.lockQual >= 0.9), JSON.stringify(aliasTable.map(o => o.lockQual.toFixed(3))));
  /* 已知限制（CONTRACT-v16）：混叠量逼近 ±125 Hz 时，每块相位推进≈π，atan 牵不入；
     Costas 会"假锁"（相位每块翻 π 而 d≈0），所以上层不能只看 locked。 */
  const edge = [2100, 2200].map(f0 => runAlias(2123, f0, 200));
  console.log('  [实测] dop=2123（混叠 +123 Hz）：' + edge.map((o, i) => 'f0=' + [2100, 2200][i] + '→locked=' + o.r.locked).join('，'));
  H.check('已知限制：混叠 +123 Hz（接近 ±125 边界）时 atan 牵不入',
    edge.every(o => o.r.locked === false), edge.map(o => o.r.locked).join(','));
}

H.section('确定性与入参保护');
{
  const built = makeEpochs('static', {});
  const opts = { codeChips: CP, fNco0: F_TRUE };
  const optsSnap = JSON.stringify(opts);
  const a1 = G.pllTrack(built.epochs, opts), a2 = G.pllTrack(built.epochs, opts);
  H.check('两次调用逐位一致',
    a1.phase.every((v, i) => v === a2.phase[i]) && a1.disc.every((v, i) => v === a2.disc[i]) && a1.freq.every((v, i) => v === a2.freq[i]));
  H.check('未修改 opts', JSON.stringify(opts) === optsSnap);
  H.check('未修改 signals（carrierPhaseRad 仍为假值 999）', built.epochs.every(e => e.sig.carrierPhaseRad === 999));
  let threw = false, bads = [];
  try {
    bads = [G.pllTrack(null, {}), G.pllTrack([], {}), G.pllTrack('x', {}),
      G.pllTrack([{ t: 1 }], { codeChips: CP }),      /* 缺 sig */
      G.pllTrack(built.epochs, {})];                   /* 缺 codeChips */
  } catch (e) { threw = true; }
  H.check('非法输入 / 缺 codeChips 返回空结果且不抛异常',
    !threw && bads.every(b => b && Array.isArray(b.phase) && b.phase.length === 0 && b.locked === false),
    'n=' + bads.length + ' lens=' + bads.map(b => b && b.phase && b.phase.length).join(','));
}
H.summary();
