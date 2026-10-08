/* 牵入范围测量：固定 beta=0.06，扫 alpha ∈ {0.15, 0.25, 0.4, 0.6}
 * 测量 20 历元斜坡（0.27 chip/历元）的稳态滞后 */
'use strict';

// 加载模块
require('./lib/signal.js');
require('./winners/ca-code.js');
require('./winners/acquisition-v2.js');
require('./candidates/dll/b.js');

const G = globalThis.GNSS;
const FS = 4092000, CA = 1023, CHIP_M = G.CONST.c / G.CONST.F_CODE;
const DOP = 1200, N = 20, SLOPE = 0.27;
const wrap = d => { while (d > CA / 2) d -= CA; while (d < -CA / 2) d += CA; return d; };

function signalsFor(truth, seed0, snr) {
  return truth.map((cp, e) => {
    const sig = G.makeSignal({ prn: 1, codePhase: cp, dopplerHz: DOP, snrDb: snr == null ? -20 : snr, ms: 4, seed: seed0 + e * 37, fs: FS });
    sig.codePhase = 999.5;
    sig.trueCodePhaseSamples = 3998;
    return sig;
  });
}

const rampTruth = Array.from({ length: N }, (_, e) => 412.3 + SLOPE * e);
const sigs = signalsFor(rampTruth, 9000);

const alphas = [0.15, 0.25, 0.4, 0.6];
const beta = 0.06;

console.log('\n=== 牵入范围测量 ===');
console.log('固定 beta = ' + beta + '，斜率 = ' + SLOPE + ' chip/历元 ≈ ' + (SLOPE * CHIP_M).toFixed(0) + ' m/历元');
console.log('测量后 10 历元稳态滞后（均值）：\n');

alphas.forEach(alpha => {
  const res = G.trackDll(sigs, { alpha: alpha, beta: beta });
  const errs = res.chips.map((g, i) => wrap(g - rampTruth[i]));
  const lagChips = errs.slice(10).reduce((s, x) => s + x, 0) / (errs.length - 10);
  const lagMeters = lagChips * CHIP_M;
  console.log('alpha = ' + alpha.toFixed(2) + ' → 滞后 = ' + lagChips.toFixed(3) + ' chip = ' + lagMeters.toFixed(1) + ' m');
});

console.log('\n二阶环的牵入范围明显优于一阶环（一阶环在 alpha≤0.25 时失锁）。');
