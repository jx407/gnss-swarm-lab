'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/app/61-raim-draw.js';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ': ' + find.slice(0, 50));
  s = s.split(find).join(rep);
}
sub(`      var it = items[n], isBad = Math.abs(it.v) > thr && n === items.length - 1 ? true : false;
      isBad = Math.abs(it.v) > thr;
      var x = box.x + n * step + step * 0.25, bw = step * 0.5;
      var y0 = cy, y1 = Y(Math.max(-ymax, Math.min(ymax, it.v)));
      ctx.fillStyle = isBad ? C.withAlpha(th.s2, 0.95) : C.withAlpha(th.s1, 0.75);`,
`      var it = items[n], isOut = (it.index === last.idx), overThr = Math.abs(it.v) > thr;
      var x = box.x + n * step + step * 0.25, bw = step * 0.5;
      var y0 = cy, y1 = Y(Math.max(-ymax, Math.min(ymax, it.v)));
      ctx.fillStyle = isOut ? C.withAlpha(th.s2, 0.95) : (overThr ? C.withAlpha(th.s2, 0.42) : C.withAlpha(th.s1, 0.75));`);
sub(`      if (isBad) C.label(ctx, C.fmt(it.v, 2), x + bw / 2, Y(it.v) - 9, th.fg, 'center', 11, 500);`,
`      if (isOut) C.label(ctx, '剔除 ' + C.fmt(it.v, 1), x + bw / 2, Y(it.v) - 9, th.fg, 'center', 11, 500);
      else if (overThr) C.label(ctx, C.fmt(it.v, 1), x + bw / 2, Y(it.v) - 9, th.mutedFg, 'center', 11);`);
fs.writeFileSync(p, s);
console.log('bar marking patched');
