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
sub('app/90-boot.js', "  var drawn = {}, resizePending = 0;", "  var drawn = {}, stale = {}, resizePending = 0;");
sub('app/90-boot.js', "    if (name === 'acq' && !APP.panels.acq.state.result) APP.panels.acq.run();\n    if (name === 'pos' && !APP.panels.pos.state.trials.length) APP.panels.pos.run();\n    if (name === 'raim' && APP.panels.raim && !APP.panels.raim.state.runs.length) APP.panels.raim.run();\n    if (name === 'atm' && APP.panels.atm && !APP.panels.atm.state.geo) APP.panels.atm.run();",
  "    /* stale[name] = 几何/星座变了、这个面板当时不可见 → 现在必须按新几何重算 */\n    if (name === 'acq' && (stale[name] || !APP.panels.acq.state.result)) APP.panels.acq.run();\n    if (name === 'pos' && (stale[name] || !APP.panels.pos.state.trials.length)) APP.panels.pos.run();\n    if (name === 'raim' && APP.panels.raim && (stale[name] || !APP.panels.raim.state.runs.length)) APP.panels.raim.run();\n    if (name === 'atm' && APP.panels.atm && (stale[name] || !APP.panels.atm.state.geo)) APP.panels.atm.run();\n    stale[name] = false;");
sub('app/90-boot.js', "          if (el2 && el2.hidden) drawn[name] = false;", "          if (el2 && el2.hidden) { drawn[name] = false; stale[name] = true; }");
