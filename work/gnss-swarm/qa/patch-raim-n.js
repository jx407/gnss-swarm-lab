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
/* RAIM 面板用最多 20 颗星：冗余越多，RAIM 与保护限级越有意义（多系统下才吃得到） */
sub('app/60-raim.js', 'var chosen = pool.length > 8 ? pickBest(pool, 8, rec) : pool;', 'var chosen = pool.length > 20 ? pickBest(pool, 20, rec) : pool;');
/* 详情行收敛：nmr 括号里的 n/dof/σ̂ 挪到保护限级之后，只留阈值 */
sub('app/60-raim.js', "'（阈值 ' + C.fmt(s.threshold, 1) + '，n = ' + s.n + '，σ̂ = ' + C.fmt(s.sigmaHat, 2) + ' m）→ ' +",
  "'（阈值 ' + C.fmt(s.threshold, 1) + '）→ ' +");
