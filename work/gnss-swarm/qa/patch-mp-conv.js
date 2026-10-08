'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
/* 面板里的墙：高度改成相对墙底点测量（-6 m ~ -6+height），与修订后的契约一致 */
function edit(file, pairs) {
  let s = fs.readFileSync(root + file, 'utf8');
  for (const [find, rep] of pairs) {
    if (s.indexOf(find) < 0) throw new Error('missing in ' + file + ': ' + find.slice(0, 60));
    s = s.split(find).join(rep);
  }
  fs.writeFileSync(root + file, s);
  console.log('patched ' + file);
}
edit('app/50-mp.js', [[
  'halfWidthM: 60, zMinM: rec.z - 6, zMaxM: rec.z - 6 + st.height',
  'halfWidthM: 60, zMinM: -6, zMaxM: -6 + st.height'
]]);
edit('app/51-mp-draw.js', [
  ['var wallLo = { x: APP.panels.mp.state.dist, y: -6 }, wallHi = { x: APP.panels.mp.state.dist, y: -6 + APP.panels.mp.state.height };',
   'var wallLo = { x: APP.panels.mp.state.dist, y: -6 }, wallHi = { x: APP.panels.mp.state.dist, y: -6 + APP.panels.mp.state.height };'],
  ['halfWidthM: 60, zMinM: rec.z - 6, zMaxM: rec.z - 6 + st.height',
   'halfWidthM: 60, zMinM: -6, zMaxM: -6 + st.height']
]);
