'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* 契约：GPS 抖动应为 prn mod 4（= svn+1），否则与"与既有星座逐位一致"矛盾 */
sub('CONTRACT-v4.md', '| G | 26561.75 | 55 | 6 | 4 | 60°·k | 90°·j + 30°·k + 1.5°·(svn mod 4) |',
`| G | 26561.75 | 55 | 6 | 4 | 60°·k | 90°·j + 30°·k + 1.5°·(prn mod 4)，其中 prn = svn + 1 |
  （**2026-10-06 修正**：原写 \`1.5°·(svn mod 4)\` 与"必须与 \`GNSS.allSats\` 逐位一致"矛盾——既有星座用的是 \`prn mod 4\`；
   两个变体都按后者实现并通过兼容判据，因此以 \`prn mod 4\` 为准。）`);
/* 权威测试：新增绝对定向 oracle（独立解析式逐颗核对，24 颗 × 2 时刻 × 3 系统） */
sub('tests/test-multiconst.js', "H.section('健壮性与确定性');",
`H.section('绝对定向 oracle（逐颗核对契约解析式）');
function oracleEcef(sys, svn, t) {
  const P = {
    G: { a: 26561.75e3, i: 55, per: 4, raanK: 60, raanOff: 0, uBase: 90, uOff: 30, dither: 1.5, uAdd: 0 },
    E: { a: 29599.8e3, i: 56, per: 8, raanK: 120, raanOff: 0, uBase: 45, uOff: 15, dither: 0, uAdd: 0 },
    C: { a: 27906.1e3, i: 55, per: 8, raanK: 120, raanOff: 60, uBase: 45, uOff: 15, dither: 0, uAdd: 20 }
  }[sys];
  const D = Math.PI / 180, MU = G.CONST.mu, OE = G.CONST.OMEGA_E;
  const k = Math.floor(svn / P.per), j = svn % P.per;
  const raan = (P.raanK * k + P.raanOff) * D - OE * t;
  const u = (P.uBase * j + P.uOff * k + P.uAdd + P.dither * ((svn + 1) % 4)) * D + Math.sqrt(MU / (P.a * P.a * P.a)) * t;
  const px = P.a * Math.cos(u), py = P.a * Math.sin(u), inc = P.i * D;
  return { x: px * Math.cos(raan) - py * Math.sin(raan) * Math.cos(inc), y: px * Math.sin(raan) + py * Math.cos(raan) * Math.cos(inc), z: py * Math.sin(inc) };
}
let orMax = 0, orWorst = '';
for (const sys of ['G', 'E', 'C']) for (const t of [0, 12345.6]) {
  const list = G.multiconst(t, [sys]);
  for (const s of list) {
    const o = oracleEcef(sys, s.svn, t);
    const d = Math.hypot(o.x - s.x, o.y - s.y, o.z - s.z);
    if (d > orMax) { orMax = d; orWorst = sys + ' ' + s.prn + ' t=' + t; }
  }
}
H.check('逐颗与契约解析式一致（≤1e-6 m，72 颗 × 2 时刻）', orMax <= 1e-6, 'max=' + orMax.toExponential(2) + ' m @' + orWorst);

H.section('健壮性与确定性');`);
