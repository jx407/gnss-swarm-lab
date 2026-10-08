'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/winners/ephemeris.js';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 60));
  s = s.split(find).join(rep);
}
sub('var u0 = (90 * j + 36 * k) * DEG;',
  '/* 标准 Walker 24/6/2（30°/面）保证几何最均匀；再叠加每星 1.5°·(prn mod 4) 的确定性相位抖动，\n     * 用来消除 Δk=3、Δj=1 的卫星对在同时过交点时严格重合的伪影（真实星座也有轨道槽位误差）。 */\n    var u0 = (90 * j + 30 * k) * DEG + (prn % 4) * 1.5 * DEG;');
sub(' *   u(t)       = 90 deg * j + 36 deg * k + n*t   （36°/面：与 60° 面间隔组合后不会出现两颗卫星严格重合，\n *              30°/面（标准 Walker 24/6/2）会在 Δk=3、Δj=1 的对同时过交点时严格重合，独立复核实测 t=0 时距离 0.000 m）',
  ' *   u(t)       = 90 deg * j + 30 deg * k + 1.5 deg * (prn mod 4) + n*t\n *              （标准 Walker 24/6/2 相位 + 每星 ≤4.5° 的确定性抖动：纯 30°/面 时 Δk=3、Δj=1 的卫星对\n *               会在同时过交点瞬间严格重合，独立复核实测 t=0 时距离 0.000 m、可见集天球夹角 0.0000°）');
fs.writeFileSync(p, s);
console.log('phase dither applied');
