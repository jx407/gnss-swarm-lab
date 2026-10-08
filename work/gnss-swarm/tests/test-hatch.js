'use strict';
/* 判据：载波相位平滑码（Hatch 滤波）GNSS.hatchSmooth（CONTRACT-v11.md §17）
 * 重点不是"降噪"（这很容易），而是三条必须成立的边界：初始码偏差不消、有限窗口有噪声地板、
 * 周跳检测的分辨率下限就是码噪声。 */
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-hatch.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', __dirname + '/../winners/ca-code.js', target);
const LAMBDA = G.CONST.c / 1575.42e6;
const N = 200, SIG_CODE = 30, SIG_PHASE = 0.01;
function gauss(rnd) { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function gen(o) {
  const rnd = G.mulberry32(o.seed == null ? 7 : o.seed), eps = [];
  for (let k = 0; k < (o.n || N); k++) {
    const R = (o.R0 == null ? 2.1e7 : o.R0) + (o.rate == null ? 5 : o.rate) * k;
    const slip = (o.slipAt != null && k >= o.slipAt) ? o.slipCycles * LAMBDA : 0;
    eps.push({ R: R, prM: R + (o.bCode || 0) + gauss(rnd) * (o.sigCode == null ? SIG_CODE : o.sigCode),
      phaseM: R + 1234.5 + gauss(rnd) * (o.sigPhase == null ? SIG_PHASE : o.sigPhase) + slip });
  }
  return eps;
}
const errOf = (out, eps) => out.smoothed.map((v, i) => v - eps[i].R);
function stat(a, from) {
  const s = a.slice(from), m = s.reduce((x, y) => x + y, 0) / s.length;
  return { mean: m, std: Math.sqrt(s.reduce((x, y) => x + (y - m) * (y - m), 0) / s.length), last: a[a.length - 1] };
}
const meanOf = a => a.reduce((x, y) => x + y, 0) / a.length;
const last = a => a[a.length - 1];

H.section('接口与形状');
H.check('hatchSmooth 存在', typeof G.hatchSmooth === 'function');
if (typeof G.hatchSmooth !== 'function') H.summary();
const eps0 = gen({});
const r0 = G.hatchSmooth(eps0, { window: 0 });
H.check('返回 { smoothed, residual, resets, usedN } 且长度 = 历元数',
  r0 && r0.smoothed.length === N && r0.residual.length === N && r0.usedN.length === N && Array.isArray(r0.resets));
H.check('输出全为有限数', r0.smoothed.every(isFinite) && r0.residual.every(isFinite) && r0.usedN.every(isFinite));
H.check('首历元 smoothed = prM、residual = 0', r0.smoothed[0] === eps0[0].prM && r0.residual[0] === 0);
H.check('生长窗口的 usedN 单调不减且末值 = 历元数', r0.usedN.every((v, i) => i === 0 || v >= r0.usedN[i - 1]) && last(r0.usedN) === N,
  '末值=' + last(r0.usedN));

H.section('降噪（生长窗口 vs 固定窗口）');
{
  const e0 = stat(errOf(r0, eps0), N - 50);
  H.check('生长窗口：后 50 历元 std ≤ 1.0 m（码噪声 30 m）', e0.std <= 1.0, 'std=' + e0.std.toFixed(3) + ' m');
  H.check('生长窗口：末值 |误差| ≤ 1.0 m', Math.abs(e0.last) <= 1.0, Math.abs(e0.last).toFixed(3) + ' m');
  const r20 = G.hatchSmooth(eps0, { window: 20 });
  const e20 = stat(errOf(r20, eps0), N - 50);
  H.check('固定窗口 20：std ≤ 6 m（有限窗口噪声地板，实测≈3 m）', e20.std <= 6, 'std=' + e20.std.toFixed(3) + ' m');
  H.check('固定窗口 20 明显劣于生长窗口（≥2 倍）', e20.std >= 2 * e0.std, e20.std.toFixed(2) + ' vs ' + e0.std.toFixed(2));
  H.check('固定窗口 usedN 饱和在 20', last(r20.usedN) === 20, '末值=' + last(r20.usedN));
}

H.section('初始码偏差：平滑消不掉');
{
  const eb = gen({ bCode: 15 });
  const rb = G.hatchSmooth(eb, { window: 0 });
  const sb = stat(errOf(rb, eb), N - 50);
  H.check('初始码偏差 15 m 原样保留（稳态均值 15±2 m）', Math.abs(sb.mean - 15) <= 2, 'mean=' + sb.mean.toFixed(2) + ' m');
  H.check('同时噪声仍被压到 ≤1 m（说明"降噪"不等于"消偏"）', sb.std <= 1.0, 'std=' + sb.std.toFixed(3) + ' m');
}

H.section('地板由载波噪声决定');
{
  const eBig = gen({ sigPhase: 1.0 });
  const rBig = G.hatchSmooth(eBig, { window: 0 });
  const sBig = stat(errOf(rBig, eBig), N - 50);
  const sSmall = stat(errOf(r0, eps0), N - 50);
  H.check('载波噪声 1 m 时地板显著抬高（std ≥ 0.5 m）', sBig.std >= 0.5, 'std=' + sBig.std.toFixed(3) + ' m');
  H.check('载波噪声 1 m 时地板绝对量级 ≥0.8 m', sBig.std >= 0.8, sBig.std.toFixed(2) + ' m');
  H.check('载波噪声放大 100 倍 → 地板抬高 ≥2 倍', sBig.std >= 2 * sSmall.std,
    sBig.std.toFixed(2) + ' vs ' + sSmall.std.toFixed(2));
}

H.section('周跳：大跳可检测，小跳低于码噪声检测不到');
{
  /* 关键：生长窗口下｜r(k)｜的 std ≈ √2·σ_code ≈ 42 m（当前码噪声与初始码误差之差），
     所以 3σ_code=90 m 阈值会频繁误报，每次误报都把平滑积累清零。推荐阈值取 4.5σ_code=135 m。 */
  const eBig = gen({ bCode: 4, slipAt: 100, slipCycles: 2000 });   /* 2000 周 ≈ 380 m，远大于码噪声 */
  const noDet = G.hatchSmooth(eBig, { window: 0 });
  const det = G.hatchSmooth(eBig, { window: 0, slipThreshold: 135 });
  const det3 = G.hatchSmooth(eBig, { window: 0, slipThreshold: 90 });
  const eNo = errOf(noDet, eBig), eDet = errOf(det, eBig);
  console.log('  [实测] 2000 周：不检测末值误差=' + last(eNo).toFixed(1) + ' m；4.5σ 阈值=' + last(eDet).toFixed(1) +
    ' m（重置 ' + det.resets.length + ' 次：' + det.resets.join(',') + '）；3σ 阈值重置 ' + det3.resets.length + ' 次');
  H.check('大周跳不检测时被污染（末值 |误差| ≥ 100 m）', Math.abs(last(eNo)) >= 100, last(eNo).toFixed(1) + ' m');
  H.check('大周跳检测后误差回到码测量量级（|末值| ≤45 m ≈ 1.5σ_code）', Math.abs(last(eDet)) <= 45, last(eDet).toFixed(1) + ' m');
  H.check('检测后的误差显著优于不检测（≤0.4 倍）', Math.abs(last(eDet)) <= 0.4 * Math.abs(last(eNo)),
    last(eDet).toFixed(1) + ' vs ' + last(eNo).toFixed(1) + ' m');
  H.check('检测发生在周跳历元（resets 含 100）', det.resets.indexOf(100) >= 0, det.resets.join(','));
  H.check('4.5σ 阈值误报很少（≤2 次/199 历元）', det.resets.length <= 2, det.resets.length + ' 次');
  H.check('3σ 阈值确实会频繁误报（>2 次），说明阈值不能按 σ_code 直取',
    det3.resets.length > 2, det3.resets.length + ' 次');
  H.check('小周跳（10 周 ≈1.9 m）用 4.5σ 阈值检测不到', G.hatchSmooth(gen({ bCode: 4, slipAt: 100, slipCycles: 10 }), { window: 0, slipThreshold: 135 }).resets.indexOf(100) < 0);
  const small = G.hatchSmooth(gen({ bCode: 4, slipAt: 100, slipCycles: 10 }), { window: 0 });
  const eSmall = errOf(small, eBig.length ? gen({ bCode: 4, slipAt: 100, slipCycles: 10 }) : []);
  H.check('小周跳被平滑悄悄吸收成偏差（不做检测时末值 |误差| 在 0.5–10 m）',
    Math.abs(last(eSmall)) >= 0.5 && Math.abs(last(eSmall)) <= 10, last(eSmall).toFixed(2) + ' m');
  H.check('带检测时 residual 序列仍全为有限值', det.residual.every(isFinite));
  H.check('重置后窗口计数重新开始（usedN[101] = 2，而不是沿用全局历元号）', det.usedN[101] === 2,
    'usedN[101]=' + det.usedN[101]);
}

H.section('确定性与入参保护');
{
  const e = gen({});
  const opts = { window: 20, slipThreshold: 90 };
  const optsSnap = JSON.stringify(opts);
  const snap = JSON.stringify(e.slice(0, 3));
  const a = G.hatchSmooth(e, opts), b = G.hatchSmooth(e, opts);
  H.check('两次调用逐位一致', a.smoothed.every((v, i) => v === b.smoothed[i]) && a.residual.every((v, i) => v === b.residual[i]));
  H.check('未修改 opts', JSON.stringify(opts) === optsSnap);
  H.check('未修改 epochs 前三个元素', JSON.stringify(e.slice(0, 3)) === snap);
  let threw = false, bads = [];
  try {
    bads = [G.hatchSmooth(null, {}), G.hatchSmooth([], {}), G.hatchSmooth('x', {}),
      G.hatchSmooth([{ prM: 1 }], {}), G.hatchSmooth([{ phaseM: 1 }], {})];
  } catch (err) { threw = true; }
  H.check('非法输入返回空结构且不抛异常',
    !threw && bads.every(x => x && x.smoothed.length === 0 && x.residual.length === 0 && x.resets.length === 0),
    'n=' + bads.length);
}
H.summary();
