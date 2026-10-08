'use strict';
/* 判据：带环路滤波的码跟踪环 GNSS.trackDll（CONTRACT-v8.md §14）
 * 关键点：真实动态（码相位每历元匀速漂移）下，"多历元快照平均"有结构性滞后，
 * 只有二阶（PI）环路能把匀速滞后压到接近零。 */
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-dll.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ca-code.js', __dirname + '/../winners/acquisition-v2.js', target);
const FS = 4092000, CA = 1023, CHIP_M = G.CONST.c / G.CONST.F_CODE, DOP = 1200, N = 20;
const SLOPE = 0.27;                     /* chip/历元 ≈ 79 m/历元，约合 0.1 s 历元下 790 m/s 视向速度 */
const wrap = d => { while (d > CA / 2) d -= CA; while (d < -CA / 2) d += CA; return d; };
function signalsFor(truth, seed0, snr) {
  return truth.map((cp, e) => {
    const sig = G.makeSignal({ prn: 1, codePhase: cp, dopplerHz: DOP, snrDb: snr == null ? -20 : snr, ms: 4, seed: seed0 + e * 37, fs: FS });
    /* 防作弊：真值字段故意写错，读 signals[i].codePhase 的实现必然失败 */
    sig.codePhase = 999.5; sig.trueCodePhaseSamples = 3998;
    return sig;
  });
}
const errsOf = (res, truth) => res.chips.map((g, i) => wrap(g - truth[i]));
const rms = (a, from) => Math.sqrt(a.slice(from).reduce((s, x) => s + x * x, 0) / (a.length - from));
const mean = (a, from) => a.slice(from).reduce((s, x) => s + x, 0) / (a.length - from);
const maxAbs = a => Math.max.apply(null, a.map(Math.abs));
const staticTruth = new Array(N).fill(412.3);
const rampTruth = Array.from({ length: N }, (_, e) => 412.3 + SLOPE * e);

H.section('接口');
H.check('trackDll 存在', typeof G.trackDll === 'function');
if (typeof G.trackDll !== 'function') H.summary();
const r0 = G.trackDll(signalsFor(staticTruth, 9000), {});
H.check('返回 { chips, disc, locked }', r0 && Array.isArray(r0.chips) && Array.isArray(r0.disc) && typeof r0.locked === 'boolean');
H.check('chips 长度 = 历元数', r0.chips.length === N, 'got ' + r0.chips.length);
H.check('全部输出有限且落在 [0,1023)', r0.chips.every(v => isFinite(v) && v >= 0 && v < CA));

H.section('静态：收敛到模型下限');
{
  const e = errsOf(r0, staticTruth);
  H.check('后 10 历元 RMS ≤ 0.15 chip（≈44 m，4 采样/chip 的模型下限）', rms(e, 10) <= 0.15,
    'RMS=' + (rms(e, 10) * CHIP_M).toFixed(1) + ' m');
  H.check('全程最大误差 ≤ 0.35 chip', maxAbs(e) <= 0.35, 'max=' + (maxAbs(e) * CHIP_M).toFixed(1) + ' m');
  H.check('locked=true', r0.locked === true);
}

H.section('动态（斜率 0.27 chip/历元）：二阶环 vs 一阶环 vs 快照平均');
{
  const r2 = G.trackDll(signalsFor(rampTruth, 9000), {});
  const e2 = errsOf(r2, rampTruth);
  const r1 = G.trackDll(signalsFor(rampTruth, 9000), { beta: 0 });
  const e1 = errsOf(r1, rampTruth);
  const avgLag = SLOPE * (N - 1) / 2;                    /* 快照平均的结构性滞后（理论值） */
  H.check('二阶环稳态滞后 ≤ 0.15 chip', Math.abs(mean(e2, 10)) <= 0.15,
    '滞后=' + (mean(e2, 10) * CHIP_M).toFixed(0) + ' m');
  H.check('二阶环比快照平均好 ≥ 5 倍', Math.abs(mean(e2, 10)) * 5 <= avgLag,
    '环 ' + (Math.abs(mean(e2, 10)) * CHIP_M).toFixed(0) + ' m vs 平均 ' + (avgLag * CHIP_M).toFixed(0) + ' m');
  H.check('二阶环全程不发散（最大误差 ≤ 0.5 chip）', maxAbs(e2) <= 0.5, 'max=' + (maxAbs(e2) * CHIP_M).toFixed(0) + ' m');
  H.check('默认 alpha=0.4 时一阶环也能锁住（滞后 ≤0.2 chip）',
    Math.abs(mean(e1, 10)) <= 0.2, '滞后=' + (mean(e1, 10) * CHIP_M).toFixed(0) + ' m');
  /* 低带宽是 DLL 的经典失效点：一阶环在牵入范围内才锁定。实测（review/probe-dll-gain.js）：
     alpha=0.25 时一阶环滞后 1.32 chip（失锁、误差随历元线性增长），二阶环仍锁在 0.19 chip。 */
  const low1 = G.trackDll(signalsFor(rampTruth, 9000), { alpha: 0.25, beta: 0 });
  const low2 = G.trackDll(signalsFor(rampTruth, 9000), { alpha: 0.25, beta: 0.06 });
  const lagLow1 = mean(errsOf(low1, rampTruth), 10), lagLow2 = mean(errsOf(low2, rampTruth), 10);
  H.check('低带宽 alpha=0.25 下，一阶环确实失锁（滞后 ≥0.5 chip）',
    Math.abs(lagLow1) >= 0.5, '一阶滞后=' + (lagLow1 * CHIP_M).toFixed(0) + ' m');
  H.check('同样低带宽下，二阶环仍锁定（滞后 ≤0.25 chip），这就是积分项的作用',
    Math.abs(lagLow2) <= 0.25, '二阶滞后=' + (lagLow2 * CHIP_M).toFixed(0) + ' m');
  H.check('低带宽下二阶环比一阶环好 ≥3 倍', Math.abs(lagLow2) * 3 <= Math.abs(lagLow1),
    '一阶 ' + (Math.abs(lagLow1) * CHIP_M).toFixed(0) + ' m vs 二阶 ' + (Math.abs(lagLow2) * CHIP_M).toFixed(0) + ' m');
  H.check('快照平均基线本身远大于 0.5 chip（说明这是个真问题）', avgLag > 0.5,
    '基线滞后 ' + (avgLag * CHIP_M).toFixed(0) + ' m = ' + avgLag.toFixed(2) + ' chip');
}

H.section('鲁棒性、确定性与入参保护');
{
  const sigs = signalsFor(staticTruth, 9000);
  const snap = sigs.map(s => s.codePhase).join(',');
  const o = { alpha: 0.4, beta: 0.06 };
  const oSnap = JSON.stringify(o);
  const a1 = G.trackDll(sigs, o), a2 = G.trackDll(sigs, o);
  H.check('两次调用逐位一致', a1.chips.length === a2.chips.length && a1.chips.every((v, i) => v === a2.chips[i]));
  H.check('未修改 signals（含 codePhase 字段）', sigs.map(s => s.codePhase).join(',') === snap && sigs.length === N);
  H.check('未修改 opts', JSON.stringify(o) === oSnap);
  let threw = false, bads = [];
  try {
    bads = [G.trackDll(null, {}), G.trackDll([], {}), G.trackDll('x', {}), G.trackDll([{ i: [1], q: [1] }], {})];
  } catch (err) { threw = true; }
  H.check('非法输入返回空结果且不抛异常',
    !threw && bads.every(b => b && Array.isArray(b.chips) && b.chips.length === 0 && b.locked === false),
    'lens=' + bads.map(b => (b && b.chips && b.chips.length)).join(','));
}

H.section('初始化可注入 + 低信噪比');
{
  const sigs = signalsFor(staticTruth, 9000);
  const wrong = G.trackDll(sigs, { init: { chips: 412.3 + 0.9, dopplerHz: DOP } });
  H.check('给出偏离 0.9 chip 的初值仍能拉回（后 10 历元 RMS ≤ 0.2 chip）',
    rms(errsOf(wrong, staticTruth), 10) <= 0.2, 'RMS=' + (rms(errsOf(wrong, staticTruth), 10) * CHIP_M).toFixed(1) + ' m');
  H.check('注入 init 时锁定且不动用捕获', wrong.locked === true && wrong.chips.length === N);
  const quiet = G.trackDll(signalsFor(staticTruth, 4321, -22), {});
  H.check('SNR −22 dB 下后 10 历元 RMS ≤ 0.2 chip',
    rms(errsOf(quiet, staticTruth), 10) <= 0.2, 'RMS=' + (rms(errsOf(quiet, staticTruth), 10) * CHIP_M).toFixed(1) + ' m');
  const drifted = G.trackDll(signalsFor(rampTruth, 4321), { alpha: 0.35, beta: 0.05 });
  H.check('换一组环路参数仍不发散（最大误差 ≤ 0.6 chip）',
    maxAbs(errsOf(drifted, rampTruth)) <= 0.6, 'max=' + (maxAbs(errsOf(drifted, rampTruth)) * CHIP_M).toFixed(0) + ' m');
}
H.summary();
