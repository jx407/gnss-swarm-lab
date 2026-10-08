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
/* (a) 扫描时顺带验证 DOP 恒等式，面板自己给出证据 */
sub('app/14-geo-scan.js',
  "      var pd = [], hd = [], vd = [], vs = [];",
  "      var pd = [], hd = [], vd = [], vs = [], maxRel = 0;");
sub('app/14-geo-scan.js',
  "        if (d && d.ok) { pd.push(d.pdop); hd.push(d.hdop); vd.push(d.vdop); }",
  "        if (d && d.ok) {\n          pd.push(d.pdop); hd.push(d.hdop); vd.push(d.vdop);\n          var rel = Math.abs(Math.hypot(d.hdop, d.vdop) - d.pdop) / Math.max(1e-12, d.pdop);\n          if (rel > maxRel) maxRel = rel;\n        }");
sub('app/14-geo-scan.js',
  "        visMedian: median(vs), visMin: vs.length ? Math.min.apply(null, vs) : NaN, samples: pd.length",
  "        visMedian: median(vs), visMin: vs.length ? Math.min.apply(null, vs) : NaN, samples: pd.length,\n        identityMaxRel: maxRel");
/* (c) boot：新标签 + 渲染分支 + 几何变化联动钩子 */
sub('app/90-boot.js',
  "['gl-tab-raim', 'gl-panel-raim', 'raim']];",
  "['gl-tab-raim', 'gl-panel-raim', 'raim'], ['gl-tab-geo', 'gl-panel-geo', 'geo']];");
sub('app/90-boot.js',
  "      else if (name === 'raim' && APP.panels.raim) APP.panels.raim.render();",
  "      else if (name === 'raim' && APP.panels.raim) APP.panels.raim.render();\n      else if (name === 'geo' && APP.panels.geo) APP.panels.geo.render();");
sub('app/90-boot.js',
  "  APP.activateTab = activate;",
  `  APP.activateTab = activate;
  /* 接收机位置/历元/掩膜一改，定位、RAIM、多径三个面板都要跟着重算（防抖 350 ms，拖动时不至于卡） */
  var geoHookTimer = 0;
  APP.onGeometryChange = function () {
    if (geoHookTimer) clearTimeout(geoHookTimer);
    geoHookTimer = setTimeout(function () {
      geoHookTimer = 0;
      try {
        if (APP.panels.mp) APP.panels.mp.render();
        if (APP.panels.geo && !document.getElementById('gl-panel-geo').hidden) APP.panels.geo.render();
        if (APP.panels.pos && !document.getElementById('gl-panel-pos').hidden) APP.panels.pos.run();
        if (APP.panels.raim && !document.getElementById('gl-panel-raim').hidden) APP.panels.raim.run();
      } catch (e) { }
    }, 350);
  };`);
/* (d) 星座面板任何改动都触发联动 */
sub('app/12-sky-wire.js',
  "      APP.panels.sky.render();\n      if (APP.state.save) APP.state.save();",
  "      APP.panels.sky.render();\n      if (APP.onGeometryChange) APP.onGeometryChange();\n      if (APP.state.save) APP.state.save();");
/* (e) 各面板标注当前接收机位置 */
sub('app/40-pos.js',
  "setText('gl-pos-detail', '50 次全部收敛，平均迭代 '",
  "setText('gl-pos-detail', '站点 ' + C.fmt(S0.lat, 1) + '°/' + C.fmt(S0.lon, 1) + '° · 50 次全部收敛，平均迭代 '");
sub('app/60-raim.js',
  "      ? 'PRN ' + st.prn + ' 注入 '",
  "      ? '站点 ' + C.fmt(S.lat, 1) + '°/' + C.fmt(S.lon, 1) + '° · PRN ' + st.prn + ' 注入 '");
sub('app/50-mp.js',
  "    setText('gl-mp-detail', 'PRN ' + d.sat.prn",
  "    setText('gl-mp-detail', '站点 ' + C.fmt(S.lat, 1) + '°/' + C.fmt(S.lon, 1) + '° · PRN ' + d.sat.prn");
