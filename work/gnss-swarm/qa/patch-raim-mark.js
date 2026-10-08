'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1 occurrence, got ' + n + ' in ' + file + ': ' + find.slice(0, 60));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
sub('app/60-raim.js',
  'nl: hit && raim.excluded[0] && raim.excluded[0].normalizedResidual });',
  'nl: hit && raim.excluded[0] && raim.excluded[0].normalizedResidual, idx: raim.excluded[0] ? raim.excluded[0].index : -1 });');
sub('app/61-raim-draw.js',
  `        var q = last.stats.normalizedResiduals[i];
        items.push({ prn: q.prn != null ? q.prn : (i + 1), v: Number(q.value != null ? q.value : q) });`,
  `        var q = last.stats.normalizedResiduals[i];
        items.push({ prn: q.prn != null ? q.prn : (i + 1), v: Number(q.value != null ? q.value : q), index: (q.index != null ? q.index : i) });`);
sub('app/61-raim-draw.js',
  `      var it = items[n], isBad = Math.abs(it.v) > thr && n === items.length - 1 ? true : false;
      isBad = Math.abs(it.v) > thr;
      var x = box.x + n * step + step * 0.25, bw = step * 0.5;
      var y0 = cy, y1 = Y(Math.max(-ymax, Math.min(ymax, it.v)));
      ctx.fillStyle = isBad ? C.withAlpha(th.s2, 0.95) : C.withAlpha(th.s1, 0.75);
      ctx.fillRect(x, Math.min(y0, y1), bw, Math.max(1.5, Math.abs(y1 - y0)));
      C.label(ctx, '' + it.prn, box.x + box.h * 0 + n * step + step / 2, box.y + box.h + 13, th.mutedFg, 'center', 11);
      if (isBad) C.label(ctx, C.fmt(it.v, 2), x + bw / 2, Y(it.v) - 9, th.fg, 'center', 11, 500);`,
  `      var it = items[n], isOut = (it.index === last.idx), overThr = Math.abs(it.v) > thr;
      var x = box.x + n * step + step * 0.25, bw = step * 0.5;
      var y0 = cy, y1 = Y(Math.max(-ymax, Math.min(ymax, it.v)));
      ctx.fillStyle = isOut ? C.withAlpha(th.s2, 0.95) : (overThr ? C.withAlpha(th.s2, 0.42) : C.withAlpha(th.s1, 0.75));
      ctx.fillRect(x, Math.min(y0, y1), bw, Math.max(1.5, Math.abs(y1 - y0)));
      C.label(ctx, '' + it.prn, x + bw / 2, box.y + box.h + 13, th.mutedFg, 'center', 11);
      if (isOut) C.label(ctx, '剔除 ' + C.fmt(it.v, 1), x + bw / 2, Y(it.v) - 9, th.fg, 'center', 11, 500);
      else if (overThr) C.label(ctx, C.fmt(it.v, 1), x + bw / 2, Y(it.v) - 9, th.mutedFg, 'center', 11);`);
