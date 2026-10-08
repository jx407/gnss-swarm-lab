'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function edit(file, pairs) {
  let s = fs.readFileSync(root + file, 'utf8');
  for (const [find, rep] of pairs) {
    const i = s.indexOf(find);
    if (i < 0) throw new Error('missing in ' + file + ': ' + find.slice(0, 70));
    s = s.slice(0, i) + rep + s.slice(i + find.length);
  }
  fs.writeFileSync(root + file, s);
  console.log('patched ' + file);
}
edit('app/11-sky-chart.js', [
  ['    drawDop(snap);\n', '    drawDop(snap);\n    if (APP.panels.sky.drawDoppler) APP.panels.sky.drawDoppler(th);\n'],
  ["detail = hit ? ('PRN ' + hit.prn + ' · 方位 ' + C.fmt(hit.azDeg, 1) + '° · 仰角 ' + C.fmt(hit.elDeg, 1) + '° · 距离 ' + C.fmtKm(hit.rangeM)) : '';",
   "var dv = APP.panels.sky.currentDoppler ? APP.panels.sky.currentDoppler() : NaN;\n      detail = hit ? ('PRN ' + hit.prn + ' · 方位 ' + C.fmt(hit.azDeg, 1) + '° · 仰角 ' + C.fmt(hit.elDeg, 1) + '° · 距离 ' + C.fmtKm(hit.rangeM) + (isFinite(dv) ? ' · 多普勒 ' + Math.round(dv) + ' Hz' : '')) : '';"]
]);
edit('app/30-acq.js', [
  ['  APP.panels.acq = { state: st, run: run, draw: function () { }, updateStats: updateStats,',
   '  APP.panels.acq = { state: st, run: run, draw: function () { }, updateStats: updateStats,\n    setDoppler: function (v) {\n      st.dop = Math.max(-5000, Math.min(5000, Math.round(v / 50) * 50));\n      var inp = el(\'gl-acq-dop\');\n      if (inp) inp.value = st.dop;\n      setText(\'gl-acq-dop-val\', (st.dop >= 0 ? \'+\' : \'\') + Math.round(st.dop) + \' Hz\');\n      setText(\'gl-acq-detail\', \'真值多普勒已按卫星几何设为 \' + (st.dop >= 0 ? \'+\' : \'\') + Math.round(st.dop) + \' Hz —— 点「开始捕获」看它落在哪个多普勒格。\');\n    },']
]);
edit('app/90-boot.js', [
  ["var TABS = [['gl-tab-sky', 'gl-panel-sky', 'sky'], ['gl-tab-ca', 'gl-panel-ca', 'ca'], ['gl-tab-acq', 'gl-panel-acq', 'acq'], ['gl-tab-pos', 'gl-panel-pos', 'pos']];",
   "var TABS = [['gl-tab-sky', 'gl-panel-sky', 'sky'], ['gl-tab-ca', 'gl-panel-ca', 'ca'], ['gl-tab-acq', 'gl-panel-acq', 'acq'], ['gl-tab-pos', 'gl-panel-pos', 'pos'], ['gl-tab-mp', 'gl-panel-mp', 'mp'], ['gl-tab-raim', 'gl-panel-raim', 'raim']];"],
  ["      else if (name === 'pos') APP.panels.pos.draw();",
   "      else if (name === 'pos') APP.panels.pos.draw();\n      else if (name === 'mp' && APP.panels.mp) APP.panels.mp.render();\n      else if (name === 'raim' && APP.panels.raim) APP.panels.raim.render();"],
  ["    if (name === 'pos' && !APP.panels.pos.state.trials.length) APP.panels.pos.run();",
   "    if (name === 'pos' && !APP.panels.pos.state.trials.length) APP.panels.pos.run();\n    if (name === 'raim' && APP.panels.raim && !APP.panels.raim.state.runs.length) APP.panels.raim.run();"],
  ["  APP.panels.boot = { init: function () {",
   "  APP.activateTab = activate;\n  APP.panels.boot = { init: function () {"],
  ["    APP.panels.pos.init();",
   "    APP.panels.pos.init();\n    if (APP.panels.mp) APP.panels.mp.init();\n    if (APP.panels.raim) APP.panels.raim.init();\n    if (APP.panels.sky.initDoppler) APP.panels.sky.initDoppler();"]
]);
