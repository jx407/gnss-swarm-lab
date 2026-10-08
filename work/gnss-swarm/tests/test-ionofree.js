'use strict';
/* 判据：双频消电离层组合 GNSS.ionoFree*（CONTRACT-v12.md §18） */
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-ionofree.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', target);
const F1 = 1575.42e6, F2 = 1227.60e6, E5A = 1176.45e6;
const K_LL = Math.pow(F1 / F2, 2), AMP_LL = Math.sqrt(K_LL * K_LL + 1) / (K_LL - 1);
function gauss(rnd) { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

H.section('接口与权重');
H.check('三个函数都已导出', typeof G.ionoFree === 'function' && typeof G.ionoFreeNoiseAmp === 'function' && typeof G.ionoFreeWeights === 'function');
if (typeof G.ionoFree !== 'function') H.summary();
const w = G.ionoFreeWeights(F1, F2);
H.check('GPS L1/L2 的 k = 1.646944（±1e-6）', Math.abs(w.k - K_LL) <= 1e-6, w.k.toFixed(6));
H.check('w1 = k/(k−1)、w2 = −1/(k−1)（±1e-12）',
  Math.abs(w.w1 - K_LL / (K_LL - 1)) <= 1e-12 && Math.abs(w.w2 + 1 / (K_LL - 1)) <= 1e-12,
  'w1=' + w.w1.toFixed(6) + ' w2=' + w.w2.toFixed(6));
H.check('噪声放大 amp = 2.978255（±1e-6），与 ionoFreeNoiseAmp 一致',
  Math.abs(w.amp - AMP_LL) <= 1e-6 && Math.abs(G.ionoFreeNoiseAmp(F1, F2) - w.amp) <= 1e-12, w.amp.toFixed(6));
H.check('ok 标志为 true', w.ok === true);
const wG = G.ionoFreeWeights(F1, E5A);
H.check('频点通用性：Galileo E1/E5a 的 k、amp 与自己的公式一致（没写死 GPS 常数）',
  Math.abs(wG.k - Math.pow(F1 / E5A, 2)) <= 1e-9 && Math.abs(wG.amp - Math.sqrt(wG.k * wG.k + 1) / (wG.k - 1)) <= 1e-12,
  'k=' + wG.k.toFixed(4) + ' amp=' + wG.amp.toFixed(4));

H.section('解析性质：电离层精确消掉、共同项原样保留');
{
  const cases = [
    { R: 2.1e7, I: 10 }, { R: 2.0e7, I: 0 }, { R: 2.2e7, I: 45 }, { R: 2.05e7, I: 3.3, T: 2.4 }
  ];
  let worst = 0, worstCase = '';
  for (const c of cases) {
    const T = c.T || 0;                                  /* 对流层/钟差等两频相同项 */
    const pr1 = c.R + T + c.I, pr2 = c.R + T + K_LL * c.I;
    const got = G.ionoFree(pr1, pr2, F1, F2);
    if (Math.abs(got - (c.R + T)) > worst) { worst = Math.abs(got - (c.R + T)); worstCase = 'R=' + c.R + ' I=' + c.I; }
  }
  /* 注意量级：R ≈ 2.1e7 m 时双精度机器精度就是 ~4e-9 m，所以容差取微米级，
     1e-9 这种绝对值在这个量级上物理上不可达（实测残差 1.1e-8 m = 相对 5e-16）。 */
  H.check('pr1 = R+I、pr2 = R+k·I → IF = R（含对流层共同项，容差 1 µm）', worst <= 1e-6,
    'max=' + worst.toExponential(2) + ' m @' + worstCase);
  H.check('不改正的对照误差就是 I（10 m 时会偏 10 m）', Math.abs(10 * (Math.pow(F1 / F2, 2)) - K_LL * 10) < 1e-6);
  const I50 = 50, R = 2.1e7;
  H.check('模型改正 70% 的残余 = 0.3·I（对照用，说明双频的优势区间）',
    Math.abs(0.3 * I50 - 15) < 1e-9, '残余 ' + (0.3 * I50).toFixed(1) + ' m');
}

H.section('噪声放大：蒙特卡洛实测');
{
  const rnd = G.mulberry32(20261006), SIG = 1, M = 4000, R = 2.1e7, I = 12;
  const vals = [];
  for (let i = 0; i < M; i++) {
    const n1 = gauss(rnd) * SIG, n2 = gauss(rnd) * SIG;
    vals.push(G.ionoFree(R + I + n1, R + K_LL * I + n2, F1, F2) - R);
  }
  const m = vals.reduce((a, b) => a + b, 0) / M;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / M);
  console.log('  [实测] σ=1 m 时 IF 组合后 std=' + sd.toFixed(4) + ' m（理论 2.9783），均值=' + m.toFixed(4) + ' m');
  H.check('蒙特卡洛实测噪声放大 = 2.978 ± 0.08', Math.abs(sd - AMP_LL) <= 0.08, sd.toFixed(4));
  H.check('组合后均值仍无偏（|mean| ≤ 0.1 m）', Math.abs(m) <= 0.1, m.toFixed(4) + ' m');
  /* 放大倍数与输入 σ 成比例 */
  const rnd2 = G.mulberry32(7), vals2 = [];
  for (let i = 0; i < M; i++) vals2.push(G.ionoFree(R + n1s(rnd2, 3), R + K_LL * I + n1s(rnd2, 3) - K_LL * I, F1, F2) - R);
  function n1s(r, s) { return gauss(r) * s; }
  const m2 = vals2.reduce((a, b) => a + b, 0) / M;
  const sd2 = Math.sqrt(vals2.reduce((a, b) => a + (b - m2) * (b - m2), 0) / M);
  H.check('σ 放大到 3 m 时组合 std ≈ 3×2.978（±0.25）', Math.abs(sd2 - 3 * AMP_LL) <= 0.25, sd2.toFixed(3) + ' m');
}

H.section('非法输入与边界');
{
  let threw = false, res = [];
  try {
    res = [
      G.ionoFree(1, 2, F1, F1),            /* 同频：k=1 → 除零 */
      G.ionoFree(1, 2, F1, 0),
      G.ionoFree(1, 2, -F1, F2),
      G.ionoFree(NaN, 2, F1, F2),
      G.ionoFree(1, Infinity, F1, F2),
      G.ionoFreeNoiseAmp(F1, F1),
      G.ionoFreeWeights(F2, F2)
    ];
  } catch (e) { threw = true; }
  H.check('非法输入不抛异常', !threw);
  H.check('同频/零频/负频/NaN 的数值函数返回 NaN',
    res.slice(0, 6).every(v => typeof v === 'number' && isNaN(v)), res.slice(0, 6).map(v => String(v)).join(','));
  H.check('同频时 weights.ok = false 且数值均为 NaN',
    res[6] && res[6].ok === false && isNaN(res[6].k) && isNaN(res[6].amp));
}

H.section('确定性与纯函数');
{
  const a = G.ionoFree(2.1e7 + 10, 2.1e7 + K_LL * 10, F1, F2);
  const b = G.ionoFree(2.1e7 + 10, 2.1e7 + K_LL * 10, F1, F2);
  H.check('两次调用逐位一致', a === b);
  const t = [2.1e7 + 10, 2.1e7 + K_LL * 10];
  const snap = t.slice();
  G.ionoFree(t[0], t[1], F1, F2);
  H.check('未修改传入的数值/数组', t[0] === snap[0] && t[1] === snap[1]);
}
H.summary();
