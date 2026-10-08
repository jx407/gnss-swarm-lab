'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/app/71-atm-draw.js';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 60));
  s = s.split(find).join(rep);
}
/* 左图：标题与图例同一行（左右分开）、单位并入标题、x 标题下沉一行、注释移到左下空白区 */
sub(`    var box = { x: 52, y: 34, w: Math.max(40, w - 66), h: Math.max(40, h - 60) };
    C.frame(ctx, box, th);
    C.label(ctx, '大气延迟随仰角变化', box.x, box.y - 12, th.fg, 'left', 11, 500);
    C.label(ctx, '仰角 (°)', box.x + box.w, box.y + box.h + 14, th.mutedFg, 'right', 11);
    C.label(ctx, '延迟 (m)', box.x - 6, box.y + 2, th.mutedFg, 'right', 11);`,
`    var box = { x: 52, y: 40, w: Math.max(40, w - 66), h: Math.max(40, h - 74) };
    C.frame(ctx, box, th);
    C.label(ctx, '延迟 (m) 随仰角变化', box.x, box.y - 24, th.fg, 'left', 11, 500);
    C.label(ctx, '仰角 (°)', box.x + box.w, box.y + box.h + 28, th.mutedFg, 'right', 11);`);
sub(`      C.label(ctx, series[s][2], box.x + 4 + s * 56, box.y - 12, series[s][1], 'left', 11, 500);`,
`      C.label(ctx, series[s][2], box.x + box.w - (2 - s) * 54, box.y - 24, series[s][1], 'left', 11, 500);`);
sub(`      C.label(ctx, vv, box.x - 6, y, th.mutedFg, 'right', 11);`, `      C.label(ctx, C.fmt(vv, vv < 10 ? 1 : 0), box.x - 6, y, th.mutedFg, 'right', 11);`);
sub(`    C.label(ctx, '圆点＝当前参与解算的卫星', box.x + box.w, box.y + box.h - 10, th.mutedFg, 'right', 11);`,
`    C.label(ctx, '圆点＝当前参与解算的卫星', box.x + 6, box.y + box.h - 10, th.mutedFg, 'left', 11);`);
/* 右图：同样处理 */
sub(`    var box = { x: 48, y: 34, w: Math.max(40, w - 62), h: Math.max(40, h - 60) };
    C.frame(ctx, box, th);
    C.label(ctx, '水平位置误差 vs 改正比例', box.x, box.y - 12, th.fg, 'left', 11, 500);
    C.label(ctx, '改正比例 (%)', box.x + box.w, box.y + box.h + 14, th.mutedFg, 'right', 11);
    C.label(ctx, '误差 (m)', box.x - 6, box.y + 2, th.mutedFg, 'right', 11);`,
`    var box = { x: 52, y: 40, w: Math.max(40, w - 66), h: Math.max(40, h - 74) };
    C.frame(ctx, box, th);
    C.label(ctx, '水平误差 (m) vs 改正比例', box.x, box.y - 24, th.fg, 'left', 11, 500);
    C.label(ctx, '改正比例 (%)', box.x + box.w, box.y + box.h + 28, th.mutedFg, 'right', 11);`);
sub(`    C.label(ctx, '0% 未改正 ' + C.fmt(st.curve[0].h, 2) + ' m', box.x + 6, box.y + box.h - 22, th.mutedFg, 'left', 11);
    C.label(ctx, '100% 全改正 ' + C.fmt(st.curve[st.curve.length - 1].h, 2) + ' m', box.x + 6, box.y + box.h - 8, th.mutedFg, 'left', 11);`,
`    C.label(ctx, '0% 未改正 ' + C.fmt(st.curve[0].h, 2) + ' m', box.x + 6, box.y + box.h - 24, th.mutedFg, 'left', 11);
    C.label(ctx, '100% 全改正 ' + C.fmt(st.curve[st.curve.length - 1].h, 2) + ' m', box.x + 6, box.y + box.h - 8, th.mutedFg, 'left', 11);`);
fs.writeFileSync(p, s);
console.log('atm labels relaid out');
