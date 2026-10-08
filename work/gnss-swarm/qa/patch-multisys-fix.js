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
/* ① 候选池掩膜：0° 会带进 0.1° 这种真实接收机根本不会用的卫星（延迟 262 m），改成不低于 5° */
for (const f of ['app/40-pos.js', 'app/60-raim.js', 'app/70-atm.js']) {
  sub(f, 'G.visible(APP.satsAt(', 'G.visible(APP.satsAt(');
}
sub('app/40-pos.js', 'var pool = G.visible(APP.satsAt(S0.hours * 3600), rec, 0);',
  'var pool = G.visible(APP.satsAt(S0.hours * 3600), rec, Math.max(5, S0.mask - 5));');
sub('app/60-raim.js', 'var pool = G.visible(APP.satsAt(S.hours * 3600), rec, 0);',
  'var pool = G.visible(APP.satsAt(S.hours * 3600), rec, Math.max(5, S.mask - 5));');
sub('app/70-atm.js', 'var pool = G.visible(APP.satsAt(S.hours * 3600), rec, 0);',
  'var pool = G.visible(APP.satsAt(S.hours * 3600), rec, Math.max(5, S.mask - 5));');
/* ② 定位面板：显示"用了 N / 可见 M 颗"，滑块上限放宽到 24（多系统下可全用） */
sub('app/40-pos.js', '    return { rec: rec, sats: chosen.map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }; }) };',
  '    return { rec: rec, pool: pool.length, sats: chosen.map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }; }) };');
sub('app/40-pos.js', '      st.trials = trials; st.rec = geo.rec; st.sats = geo.sats; st.sigmas = sigmas;',
  '      st.trials = trials; st.rec = geo.rec; st.sats = geo.sats; st.sigmas = sigmas; st.pool = geo.pool;');
sub('app/40-pos.js', "setText('gl-pos-3rms', '含高程分量 ' + C.fmt(ru3, 2) + ' m · ' + st.sats.length + ' 颗');",
  "setText('gl-pos-3rms', '含高程分量 ' + C.fmt(ru3, 2) + ' m · 用 ' + st.sats.length + ' / 可见 ' + (st.pool || st.sats.length) + ' 颗');");
sub('shell.html', '<input class="form-range" type="range" id="gl-pos-n" min="4" max="10" step="1" value="8">',
  '<input class="form-range" type="range" id="gl-pos-n" min="4" max="24" step="1" value="8">');
/* ③ 说明：多系统下建议把"参与解算卫星"调大 */
sub('shell.html', '读法：原点是真实位置。伪距噪声按仰角放大',
  '读法：原点是真实位置（切到三系统后可以把「参与解算卫星」拉到 20 以上，几何还能再改善）。伪距噪声按仰角放大');
