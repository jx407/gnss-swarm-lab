'use strict';
const fs = require('fs');
const S = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html';
const lines = fs.readFileSync(S, 'utf8').split('\n');
let n = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === '      <details class="gl-group">') {
    lines[i] = '      <details class="gl-cold-group">\n' + lines[i + 1].replace('        ', '        ') + '\n        <div class="gl-group">';
    lines.splice(i + 1, 1);   /* 原来的 <summary> 行已并入上面 */
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] === '      </details>') { lines[j] = '        </div>\n      </details>'; break; }
    }
    n++;
  }
}
if (n !== 3) { console.error('converted ' + n); process.exit(1); }
fs.writeFileSync(S, lines.join('\n'));
console.log('OK ' + n + ' 组改成 details.gl-cold-group > div.gl-group');
