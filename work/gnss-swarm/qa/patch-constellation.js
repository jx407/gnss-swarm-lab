'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep, count) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== (count == null ? 1 : count)) throw new Error('expected ' + (count || 1) + ', got ' + n + ' in ' + file + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* 星座相位：30°/面 → 36°/面，消除 Δk=3、Δj=1 的两颗卫星在过交点瞬间严格重合的伪影 */
sub('winners/ephemeris.js', ' *   u(t)       = 90 deg * j + 30 deg * k + n*t',
  ' *   u(t)       = 90 deg * j + 36 deg * k + n*t   （36°/面：与 60° 面间隔组合后不会出现两颗卫星严格重合，\n *              30°/面（标准 Walker 24/6/2）会在 Δk=3、Δj=1 的对同时过交点时严格重合，独立复核实测 t=0 时距离 0.000 m）');
sub('winners/ephemeris.js', 'var u0 = (90 * j + 30 * k) * DEG;', 'var u0 = (90 * j + 36 * k) * DEG;');
/* 权威测试的独立解析 oracle 同步 */
sub('tests/test-ephemeris.js', 'const u = (90 * j + 30 * k) * Math.PI / 180 + Math.sqrt(MU / (A * A * A)) * t;',
  'const u = (90 * j + 36 * k) * Math.PI / 180 + Math.sqrt(MU / (A * A * A)) * t;');
sub('tests/test-ephemeris.js',
  "H.check('逐颗卫星位置与契约解析式一致（绝对定向 ≤ 2 km，24 颗全覆盖）', orMax <= 2000, 'max=' + Math.round(orMax) + ' m @' + orWorst);",
  `H.check('逐颗卫星位置与契约解析式一致（绝对定向 ≤ 2 km，24 颗全覆盖）', orMax <= 2000, 'max=' + Math.round(orMax) + ' m @' + orWorst);

/* 卫星不得重合（独立复核发现的缺陷：u=90j+30k 时 Δk=3、Δj=1 的对会在过交点瞬间严格重合，
 * t=0 实测 PRN1/PRN14 距离 0.000 m，可见星数与 DOP 统计都会因此失真）。 */
let sepMin = Infinity, sepWorst = '';
for (let step2 = 0; step2 < 120; step2++) {
  const t2 = step2 * (T / 120);
  const ss = G.allSats(t2);
  for (let a2 = 0; a2 < ss.length; a2++) for (let b2 = a2 + 1; b2 < ss.length; b2++) {
    const d2 = Math.hypot(ss[a2].x - ss[b2].x, ss[a2].y - ss[b2].y, ss[a2].z - ss[b2].z);
    if (d2 < sepMin) { sepMin = d2; sepWorst = 'PRN' + ss[a2].prn + '/PRN' + ss[b2].prn + ' t=' + (t2 / 3600).toFixed(2) + 'h'; }
  }
}
H.check('全轨道周期内任意两颗卫星不重合（最小间距 > 100 km）', sepMin > 100e3, 'min=' + (sepMin / 1000).toFixed(1) + ' km @' + sepWorst);`);
/* 契约文档同步（v1 §2 的相位公式） */
sub('CONTRACT.md', '在轨道平面内的纬度幅角 `u = 90°·j + 30°·k`（j=0..3；即相邻轨道面之间再交错 30°，Walker 24/6/2 相位布局）',
  '在轨道平面内的纬度幅角 `u = 90°·j + 36°·k`（j=0..3）。**2026-10-05 二次修订**：原用 30°·k（标准 Walker 24/6/2），但该相位在 Δk=3、Δj=1 的卫星对上会让两颗星在同时过交点时**严格重合**（独立复核实测 t=0 时 PRN1/PRN14 距离 0.000 m，可见集里 PRN3/PRN16 天球夹角 0.0000°），使可见星数与 DOP 统计失真；改为 36°/面后全周期最小间距 > 100 km（权威测试新增该判据）。');
