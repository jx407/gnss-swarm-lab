'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 70));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* boot：新标签 + 渲染分支 + 首次显示执行 + 初始化 + 几何联动 */
sub('app/90-boot.js', "['gl-tab-geo', 'gl-panel-geo', 'geo']];", "['gl-tab-geo', 'gl-panel-geo', 'geo'], ['gl-tab-atm', 'gl-panel-atm', 'atm']];");
sub('app/90-boot.js', "      else if (name === 'geo' && APP.panels.geo) APP.panels.geo.render();",
  "      else if (name === 'geo' && APP.panels.geo) APP.panels.geo.render();\n      else if (name === 'atm' && APP.panels.atm) APP.panels.atm.draw();");
sub('app/90-boot.js', "    if (name === 'raim' && APP.panels.raim && !APP.panels.raim.state.runs.length) APP.panels.raim.run();",
  "    if (name === 'raim' && APP.panels.raim && !APP.panels.raim.state.runs.length) APP.panels.raim.run();\n    if (name === 'atm' && APP.panels.atm && !APP.panels.atm.state.geo) APP.panels.atm.run();");
sub('app/90-boot.js', "    if (APP.panels.sky.initDoppler) APP.panels.sky.initDoppler();",
  "    if (APP.panels.atm) APP.panels.atm.init();\n    if (APP.panels.sky.initDoppler) APP.panels.sky.initDoppler();");
sub('app/90-boot.js', "        if (APP.panels.geo && !document.getElementById('gl-panel-geo').hidden) APP.panels.geo.render();",
  "        if (APP.panels.geo && !document.getElementById('gl-panel-geo').hidden) APP.panels.geo.render();\n        if (APP.panels.atm && !document.getElementById('gl-panel-atm').hidden) APP.panels.atm.run();");
/* 星座面板：键盘可选卫星（可访问性） */
sub('app/12-sky-wire.js', `  var sky = el('gl-sky-canvas');`,
`  /* 键盘可用：下拉选择卫星（等价于点星图），补齐画布点击的无障碍缺口 */
  var skySel = el('gl-sky-prn');
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
  };
  var sky = el('gl-sky-canvas');`);
sub('app/12-sky-wire.js', `      S.selPrn = best && best.prn !== S.selPrn ? best.prn : null;
      APP.panels.sky.render();`,
`      S.selPrn = best && best.prn !== S.selPrn ? best.prn : null;
      if (APP.panels.sky.syncSelect) APP.panels.sky.syncSelect();
      APP.panels.sky.render();`);
