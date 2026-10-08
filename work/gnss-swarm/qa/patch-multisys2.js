'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep, expect) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== (expect == null ? 1 : expect)) throw new Error('expected ' + (expect || 1) + ', got ' + n + ' in ' + file + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* ① 系统选择联动 */
sub('app/12-sky-wire.js', "  var sky = el('gl-sky-canvas');",
`  var sysSel = el('gl-sys');
  if (sysSel) {
    var SYS_MAP = { G: ['G'], GE: ['G', 'E'], GEC: ['G', 'E', 'C'] };
    sysSel.value = (APP.state.systems || ['G']).join('') === 'GE' ? 'GE' : ((APP.state.systems || []).length === 3 ? 'GEC' : 'G');
    sysSel.addEventListener('change', function () {
      var list = SYS_MAP[sysSel.value] || ['G'];
      APP.setSystems(list, sysSel.options[sysSel.selectedIndex].textContent.trim());
      APP.panels.sky.render();
      if (APP.onGeometryChange) APP.onGeometryChange();
      if (APP.state.save) APP.state.save();
    });
  }
  var sky = el('gl-sky-canvas');`);
/* ② 星座面板：可见数带系统构成 + 在轨总数 */
sub('app/11-sky-chart.js', "setText('gl-sky-n-ctx', '掩膜 ' + S.mask + '° · 全星座 24 颗');",
  "setText('gl-sky-n-ctx', '掩膜 ' + S.mask + '° · 在轨 ' + (APP.satsAt(S.hours * 3600).length) + ' 颗' + (APP.sysCountsText ? '（' + APP.sysCountsText(APP.satsAt(S.hours * 3600)) + '）' : ''));");
sub('app/11-sky-chart.js', "detail = '可见 ' + snap.vis.length + ' 颗 · 24 h 内最小 PDOP ' + C.fmt(best, 2) + '（t+' + C.fmt(bestH, 1) + ' h）';",
  "detail = '可见 ' + snap.vis.length + ' 颗（' + (APP.sysCountsText ? APP.sysCountsText(snap.vis) : '') + '） · 24 h 内最小 PDOP ' + C.fmt(best, 2) + '（t+' + C.fmt(bestH, 1) + ' h）';");
/* ③ manifest：加入 helper 与多系统模块 */
let m = fs.readFileSync(root + 'winners/manifest.txt', 'utf8');
if (!/winners\/multiconst.js/.test(m)) m = m.replace('winners/uwls.js', 'winners/uwls.js\nwinners/multiconst.js');
if (!/app\/05-constellation.js/.test(m)) m = m.replace('app/00-core.js', 'app/00-core.js\napp/05-constellation.js');
fs.writeFileSync(root + 'winners/manifest.txt', m);
console.log('manifest updated');
