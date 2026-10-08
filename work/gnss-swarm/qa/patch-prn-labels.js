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
/* ① 星图：选中比较改成字符串标签（多系统 prn 形如 'E01'） */
sub('app/10-sky.js', '      if (S.selPrn === sat.prn) {', "      if (String(S.selPrn) === String(sat.prn)) {");
sub('app/11-sky-chart.js', '      for (var k = 0; k < snap.all.length; k++) if (snap.all[k].prn === S.selPrn) hit = snap.all[k];',
  '      for (var k = 0; k < snap.all.length; k++) if (String(snap.all[k].prn) === String(S.selPrn)) hit = snap.all[k];');
/* ② 卫星下拉：从当前星座集合生成，支持多系统标签 */
sub('app/12-sky-wire.js', `  var skySel = el('gl-sky-prn');
  if (skySel) {
    var opts = '';
    for (var pi = 1; pi <= 24; pi++) opts += '<option value="' + pi + '">PRN ' + pi + '</option>';
    skySel.innerHTML = opts;
    skySel.addEventListener('change', function () {
      S.selPrn = parseInt(skySel.value, 10);
      APP.panels.sky.render();
      if (APP.onGeometryChange) APP.onGeometryChange();
    });
  }
  APP.panels.sky.syncSelect = function () {
    if (skySel && S.selPrn) skySel.value = String(S.selPrn);
  };`,
`  var skySel = el('gl-sky-prn');
  function refreshSkySelect() {
    if (!skySel || !APP.satsAt) return;
    var list = APP.satsAt(S.hours * 3600).slice().sort(function (a, b) { return String(a.prn) < String(b.prn) ? -1 : 1; });
    var html = '', keep = String(S.selPrn || '');
    for (var i = 0; i < list.length; i++) {
      var label = String(list[i].prn);
      html += '<option value="' + label + '">' + (APP.sysName ? APP.sysName(APP.sysOf(label)) + ' ' + label : label) + '</option>';
    }
    skySel.innerHTML = html;
    if (keep && html.indexOf('value="' + keep + '"') >= 0) skySel.value = keep;
  }
  if (skySel) {
    refreshSkySelect();
    skySel.addEventListener('change', function () {
      S.selPrn = skySel.value;
      APP.panels.sky.render();
      if (APP.onGeometryChange) APP.onGeometryChange();
    });
  }
  APP.panels.sky.refreshSelect = refreshSkySelect;
  APP.panels.sky.syncSelect = function () {
    if (skySel && S.selPrn != null) skySel.value = String(S.selPrn);
  };`);
/* ③ 多普勒：按标签在星座集合里查位置，速度用中心差分（多系统通用）；非 GPS 星不允许送进 C/A 捕获 */
sub('app/13-sky-doppler.js', `      var s = G.satEcef(prn, t), look = G.lookAngles(rec, s);
      if (look.elDeg < 0) { pts.push([h, NaN]); continue; }
      var dx = s.x - rec.x, dy = s.y - rec.y, dz = s.z - rec.z, r = Math.hypot(dx, dy, dz);
      var v = G.satVelocity(prn, t);
      var rate = (v.x * dx + v.y * dy + v.z * dz) / r;`,
`      var s = findSat(prn, t);
      if (!s) { pts.push([h, NaN]); continue; }
      var look = G.lookAngles(rec, s);
      if (look.elDeg < 0) { pts.push([h, NaN]); continue; }
      var dx = s.x - rec.x, dy = s.y - rec.y, dz = s.z - rec.z, r = Math.hypot(dx, dy, dz);
      /* 速度用位置中心差分：多系统下 GNSS.satVelocity 只认 GPS 的数字 PRN */
      var DT = 0.05, sp = findSat(prn, t - DT), sn = findSat(prn, t + DT);
      var v = (sp && sn) ? { x: (sn.x - sp.x) / (2 * DT), y: (sn.y - sp.y) / (2 * DT), z: (sn.z - sp.z) / (2 * DT) } : { x: 0, y: 0, z: 0 };
      var rate = (v.x * dx + v.y * dy + v.z * dz) / r;`);
sub('app/13-sky-doppler.js', '  function series(prn) {',
`  function findSat(prn, tSec) {
    var list = APP.satsAt ? APP.satsAt(tSec) : G.allSats(tSec);
    for (var i = 0; i < list.length; i++) if (String(list[i].prn) === String(prn)) return list[i];
    return null;
  }
  function series(prn) {`);
sub('app/13-sky-doppler.js', `      var v = current();
      if (!isFinite(v) || !APP.panels.acq.setDoppler) { setText('gl-sky-detail', '先点一颗实心卫星。'); return; }
      APP.panels.acq.setDoppler(v);
      if (APP.activateTab) APP.activateTab(2);`,
`      if (String(S.selPrn || '').charAt(0) !== 'G') {
        setText('gl-sky-detail', 'PRN ' + S.selPrn + ' 属于 ' + (APP.sysName ? APP.sysName(APP.sysOf(S.selPrn)) : '非 GPS') + '：捕获面板演示的是 GPS C/A 码，换一颗 GPS 卫星再送过去。');
        return;
      }
      var v = current();
      if (!isFinite(v) || !APP.panels.acq.setDoppler) { setText('gl-sky-detail', '先选一颗 GPS 卫星（G01…G24）。'); return; }
      APP.panels.acq.setDoppler(v);
      if (APP.activateTab) APP.activateTab(2);`);
/* ④ 切换星座后刷新下拉 */
sub('app/12-sky-wire.js', `      APP.setSystems(list, sysSel.options[sysSel.selectedIndex].textContent.trim());
      APP.panels.sky.render();`,
`      APP.setSystems(list, sysSel.options[sysSel.selectedIndex].textContent.trim());
      if (APP.panels.sky.refreshSelect) APP.panels.sky.refreshSelect();
      APP.panels.sky.render();`);
