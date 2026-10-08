'use strict';
const fs = require('fs');
const S = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/build-standalone.js';
const L = fs.readFileSync(S, 'utf8').split('\n');
if (L[10] !== "const body = '<main>" || L[11] !== "' + bodyRaw + '" || L[12] !== "</main>';") {
  console.error('unexpected lines: ' + JSON.stringify([L[10], L[11], L[12]])); process.exit(1);
}
const bs = String.fromCharCode(92);   /* 反斜杠，避免各层转义歧义 */
L.splice(10, 3, "const body = '<main>" + bs + "n' + bodyRaw + '" + bs + "n</main>';");
fs.writeFileSync(S, L.join('\n'));
console.log('OK：已重建该行');
