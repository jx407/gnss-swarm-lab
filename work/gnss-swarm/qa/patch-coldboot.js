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
sub('app/90-boot.js', "['gl-tab-atm', 'gl-panel-atm', 'atm']];", "['gl-tab-atm', 'gl-panel-atm', 'atm'], ['gl-tab-cold', 'gl-panel-cold', 'cold']];");
sub('app/90-boot.js', "      else if (name === 'atm' && APP.panels.atm) APP.panels.atm.draw();",
  "      else if (name === 'atm' && APP.panels.atm) APP.panels.atm.draw();\n      else if (name === 'cold' && APP.panels.cold) APP.panels.cold.draw();");
sub('app/90-boot.js', "    if (name === 'atm' && APP.panels.atm && (stale[name] || !APP.panels.atm.state.geo)) APP.panels.atm.run();",
  "    if (name === 'atm' && APP.panels.atm && (stale[name] || !APP.panels.atm.state.geo)) APP.panels.atm.run();\n    if (name === 'cold' && APP.panels.cold && (stale[name] || !APP.panels.cold.state.items.length)) APP.panels.cold.run();");
sub('app/90-boot.js', "    if (APP.panels.atm) APP.panels.atm.init();", "    if (APP.panels.atm) APP.panels.atm.init();\n    if (APP.panels.cold) APP.panels.cold.init();");
sub('app/90-boot.js', "acq: 'gl-panel-acq', geo: 'gl-panel-geo', mp: 'gl-panel-mp', atm: 'gl-panel-atm', ca: 'gl-panel-ca' };",
  "acq: 'gl-panel-acq', geo: 'gl-panel-geo', mp: 'gl-panel-mp', atm: 'gl-panel-atm', ca: 'gl-panel-ca', cold: 'gl-panel-cold' };");
let m = fs.readFileSync(root + 'winners/manifest.txt', 'utf8');
if (!/80-coldstart/.test(m)) { m = m.replace('app/71-atm-draw.js', 'app/71-atm-draw.js\napp/80-coldstart.js\napp/81-coldstart-draw.js'); fs.writeFileSync(root + 'winners/manifest.txt', m); console.log('manifest updated'); }
