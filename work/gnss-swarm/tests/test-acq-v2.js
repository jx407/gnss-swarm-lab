'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-acq-v2.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ca-code.js', target);
const FS = 4092000;
const OPTS = {};

function circDelta(a, b, n) { const d = ((a - b) % n + n) % n; return Math.min(d, n - d); }
function acquisitionOf(sig) { return G.acquire(sig, OPTS); }

H.section('新字段与口径自洽');
const good = G.makeSignal({ prn: 7, codePhase: 312.5, dopplerHz: 2300, snrDb: -20, ms: 4, seed: 11 });
const r = acquisitionOf(good);
H.check('返回 detected / noiseFloor / peakSigma / usedSamples', r && 'detected' in r && 'noiseFloor' in r && 'peakSigma' in r && 'usedSamples' in r);
H.check('usedSamples = 16368', r.usedSamples === 16368, 'got ' + r.usedSamples);
H.check('noiseFloor 与 surface 均值自洽', (() => { let s = 0; for (let i = 0; i < r.surface.length; i++) s += r.surface[i]; return Math.abs(r.noiseFloor - (s / r.surface.length) / 1.2533141) < 1e-6 * Math.max(1, r.noiseFloor); })(), 'floor=' + H.fmt(r.noiseFloor));
H.check('peakSigma = peakMetric / noiseFloor', Math.abs(r.peakSigma - r.peakMetric / r.noiseFloor) < 1e-6, 'sigma=' + H.fmt(r.peakSigma, 2));
H.check('真实信号 detected = true', r.detected === true);
H.check('真实信号 peakRatio ≥ 8', r.peakRatio >= 8, 'ratio=' + H.fmt(r.peakRatio, 2));
H.check('peakRatio 只由 surface 决定（同 surface 两次调用一致）', (() => { const r2 = acquisitionOf(good); return Math.abs(r2.peakRatio - r.peakRatio) < 1e-9; })());
if (!r || !('detected' in r) || !('peakSigma' in r) || !('noiseFloor' in r)) {
  H.check('实现必须提供 v2 新字段 detected / peakSigma / noiseFloor / usedSamples', false, '缺少新字段，后续判据无法评估');
  H.summary();
}

H.section('弱信号与边界');
for (const [db, prn, phase, dop, seed] of [[-20, 7, 312.5, 2300, 11], [-26, 19, 900.25, -1750, 23]]) {
  const sig = G.makeSignal({ prn, codePhase: phase, dopplerHz: dop, snrDb: db, ms: 4, seed });
  const rr = acquisitionOf(sig);
  const dChip = circDelta(rr.codePhaseSamples, phase * FS / 1023e3, sig.n) / (FS / 1023e3);
  H.check(db + ' dB：相位误差 ≤ 1 chip', dChip <= 1, 'err=' + dChip.toFixed(3));
  H.check(db + ' dB：多普勒误差 ≤ 1 格', Math.abs(rr.dopplerHz - dop) <= rr.dopplerStepHz + 1e-6, 'got ' + rr.dopplerHz);
  H.check(db + ' dB：detected = true', rr.detected === true, 'sigma=' + H.fmt(rr.peakSigma, 2) + ' ratio=' + H.fmt(rr.peakRatio, 2));
}

H.section('纯噪声 100 个种子：零误检（真实高斯噪声，含回归种子 26）');
/* 注意：GNSS.makeSignal 把信号与噪声同乘 amp，amp:0 得到的是全零数组而不是噪声。
 * 这里自己生成单位方差高斯 i/q，才算真正的「无信号」输入。 */
function noiseSignal(seed, ms) {
  const n = Math.round(FS * ms / 1000), i = new Float32Array(n), q = new Float32Array(n);
  const rnd = G.mulberry32(seed);
  for (let k = 0; k < n; k += 2) {
    const u1 = 1 - rnd(), u2 = rnd(), u3 = 1 - rnd(), u4 = rnd();
    const r1 = Math.sqrt(-2 * Math.log(u1)), r2 = Math.sqrt(-2 * Math.log(u3));
    i[k] = r1 * Math.cos(2 * Math.PI * u2);
    if (k + 1 < n) i[k + 1] = r1 * Math.sin(2 * Math.PI * u2);
    q[k] = r2 * Math.cos(2 * Math.PI * u4);
    if (k + 1 < n) q[k + 1] = r2 * Math.sin(2 * Math.PI * u4);
  }
  return { i: i, q: q, fs: FS, ms: ms, n: n, prn: 9, codePhase: 0, dopplerHz: 0, snrDb: 0, amp: 1 };
}
let over6 = 0, det = 0, worstRatio = 0, worstSeed = 0, worstSigma = 0;
for (let seed = 1; seed <= 100; seed++) {
  const nr = G.acquire(noiseSignal(seed, 4), OPTS);
  if (!nr || nr.ok === false) continue;
  if (nr.detected) det++;
  if (nr.peakRatio >= 6) over6++;
  if (nr.peakRatio > worstRatio) { worstRatio = nr.peakRatio; worstSeed = seed; worstSigma = nr.peakSigma; }
}
H.check('误检数 = 0 / 100（真实高斯噪声）', det === 0, 'detected=' + det);
H.check('peakRatio ≥ 6 的种子数 = 0 / 100', over6 === 0, 'over6=' + over6);
H.check('最坏种子比值 < 6', worstRatio < 6, 'worst=' + H.fmt(worstRatio, 2) + ' @seed=' + worstSeed + ' sigma=' + H.fmt(worstSigma, 2));
const seed26 = G.acquire(noiseSignal(26, 4), OPTS);
H.check('回归：seed=26 真实噪声不再报高比值', !seed26.detected && seed26.peakRatio < 6, 'ratio=' + H.fmt(seed26.peakRatio, 2) + ' sigma=' + H.fmt(seed26.peakSigma, 2));

H.section('畸形输入必须 ok:false 且不抛异常');
function safe(fn) { try { return fn(); } catch (e) { return { threw: String(e && e.message || e) }; } }
const base = G.makeSignal({ prn: 3, codePhase: 10, dopplerHz: 0, snrDb: -20, ms: 2, seed: 5 });
const bad1 = safe(() => G.acquire(null, OPTS));
const sigShortI = Object.assign({}, base, { i: base.i.slice(0, base.i.length - 100) });
const bad2 = safe(() => G.acquire(sigShortI, OPTS));
const sigNaN = Object.assign({}, base, { i: base.i.slice() });
sigNaN.i[0] = NaN;
const bad3 = safe(() => G.acquire(sigNaN, OPTS));
const sigZero = Object.assign({}, base, { n: 0, i: new Float32Array(0), q: new Float32Array(0) });
const bad4 = safe(() => G.acquire(sigZero, OPTS));
const sigFs0 = Object.assign({}, base, { fs: 0 });
const bad5 = safe(() => G.acquire(sigFs0, OPTS));
const cases = [['signal=null', bad1], ['i/q 长度不一致', bad2], ['i[0]=NaN', bad3], ['n=0', bad4], ['fs=0', bad5]];
for (const [name, res] of cases) {
  H.check(name + ' -> ok:false，无异常', res && res.ok === false && !res.threw, res && res.threw ? 'threw: ' + res.threw : 'ok=' + (res && res.ok));
}
const truncated = Object.assign({}, base, { ms: 9 });
const tr = safe(() => G.acquire(truncated, OPTS));
H.check('opts.ms 超过 signal.ms 时按信号长度截断', tr && tr.ok === true && tr.usedSamples <= base.n, 'usedSamples=' + (tr && tr.usedSamples) + ' n=' + base.n);
H.summary();
