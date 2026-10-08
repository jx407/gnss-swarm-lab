'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-acquisition.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', target);
const FS = 4092000, STEP = Math.round(FS / 1023e3);

function circDelta(a, b, n) { const d = ((a - b) % n + n) % n; return Math.min(d, n - d); }

function runCase(name, sig, expectDetect) {
  H.section(name);
  if (!G.acquire) { H.check('GNSS.acquire 存在', false); return null; }
  const t0 = Date.now();
  const r = G.acquire(sig, {});
  const dt = Date.now() - t0;
  if (!r || typeof r !== 'object') { H.check('返回对象', false); return null; }
  H.check('surface 长度 = nDoppler × nCode', r.surface && r.surface.length === r.nDoppler * r.nCode,
    'len=' + (r.surface && r.surface.length) + ' nD=' + r.nDoppler + ' nC=' + r.nCode);
  H.check('surface 全为有限非负数', (() => { let ok = true; for (let i = 0; i < r.surface.length; i++) { const v = r.surface[i]; if (!Number.isFinite(v) || v < 0) { ok = false; break; } } return ok; })());
  let bi = 0, bv = -Infinity;
  for (let i = 0; i < r.surface.length; i++) if (r.surface[i] > bv) { bv = r.surface[i]; bi = i; }
  const peakD = Math.floor(bi / r.nCode), peakC = bi % r.nCode;
  const trueSamples = sig.codePhase * FS / 1023e3;
  const dChips = circDelta(r.codePhaseSamples, trueSamples, sig.n) / STEP;
  const dDop = Math.abs(r.dopplerHz - sig.dopplerHz);
  H.check('耗时 < 400 ms', dt < 400, dt + ' ms');
  H.check('报告峰值与 surface argmax 一致', circDelta(r.codePhaseSamples, peakC * r.codeStepSamples, sig.n) <= 4 &&
    Math.abs(r.dopplerHz - (r.dopplerMinHz + peakD * r.dopplerStepHz)) <= r.dopplerStepHz + 1e-6,
    'argmax col=' + peakC + ' row=' + peakD + ' | report chips=' + r.codePhaseChips.toFixed(2));
  if (expectDetect) {
    H.check('码相位误差 ≤ 1 chip', dChips <= 1.0, 'err=' + dChips.toFixed(3) + ' chip (true=' + sig.codePhase + ', got=' + r.codePhaseChips.toFixed(2) + ')');
    H.check('多普勒误差 ≤ 1 格', dDop <= r.dopplerStepHz + 1e-6, 'true=' + sig.dopplerHz + ' got=' + r.dopplerHz + ' (step ' + r.dopplerStepHz + ')');
    H.check('峰值/次峰 ≥ 8', r.peakRatio >= 8, 'ratio=' + Number(r.peakRatio).toFixed(2));
  } else {
    H.check('纯噪声时峰值/次峰 < 6', r.peakRatio < 6, 'ratio=' + Number(r.peakRatio).toFixed(2));
  }
  return r;
}

const s1 = G.makeSignal({ prn: 7, codePhase: 312.5, dopplerHz: 2300, snrDb: -20, ms: 4, seed: 11 });
const r1 = runCase('真实信号 PRN7 / 相位 312.5 chip / +2300 Hz / -20 dB', s1, true);
if (r1) {
  const r1b = G.acquire(s1, {});
  H.check('确定性：两次调用结果一致', r1.codePhaseSamples === r1b.codePhaseSamples && r1.dopplerHz === r1b.dopplerHz &&
    r1.surface.length === r1b.surface.length && (() => { for (let i = 0; i < r1.surface.length; i++) if (r1.surface[i] !== r1b.surface[i]) return false; return true; })());
}
/* 弱信号用 -26 dB：4 ms 相干积分的理论峰约 7.2σ、4.2 万格噪声最大约 4.6σ，属于可靠但已接近极限的检测。
 * 原判据写的 -30 dB 经红队实测并不成立（理论峰 5.7σ，50 个种子只有 3 个能检出，某些纯噪声种子 CFAR 比值还能到 15），
 * 因此 -30 dB 不再作为验收要求，只在可视化面板里作为「边缘检测」现场演示。 */
runCase('弱信号 PRN19 / 相位 900.25 chip / -1750 Hz / -26 dB', G.makeSignal({ prn: 19, codePhase: 900.25, dopplerHz: -1750, snrDb: -26, ms: 4, seed: 23 }), true);
runCase('纯噪声（无信号）', G.makeSignal({ prn: 5, amp: 0, snrDb: -20, ms: 4, seed: 31 }), false);
const s3 = G.makeSignal({ prn: 12, codePhase: 40, dopplerHz: -4000, snrDb: -24, ms: 4, seed: 77 });
const r3 = runCase('边界多普勒 PRN12 / -4000 Hz / -24 dB', s3, true);
H.summary();
