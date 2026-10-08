'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(file, s.split(find).join(rep));
  console.log('patched ' + file.split('/').pop());
}
const f = root + 'app/81-coldstart-draw.js';
/* ① 逐星耗时图：单位并入标题，去掉底部轴标题 */
sub(f, "    C.label(ctx, '每颗星的二维捕获耗时（41 个多普勒格 × 4 ms 相干积分）', box.x, box.y - 12, th.fg, 'left', 11, 500);\n    C.label(ctx, '耗时 (ms)', box.x + box.w, box.y + box.h + 14, th.mutedFg, 'right', 11);",
  "    C.label(ctx, '每颗星的二维捕获耗时 (ms) —— 41 个多普勒格 × 4 ms 相干积分', box.x, box.y - 12, th.fg, 'left', 11, 500);");
/* ② TTFF 阶梯：轴名并入标题 */
sub(f, "    C.label(ctx, '累计耗时（TTFF 阶梯）', box.x, box.y - 12, th.fg, 'left', 11, 500);\n    C.label(ctx, '第 n 颗', box.x + box.w, box.y + box.h + 14, th.mutedFg, 'right', 11);",
  "    C.label(ctx, '累计耗时 (ms) · 横轴＝第 n 颗（TTFF 阶梯）', box.x, box.y - 12, th.fg, 'left', 11, 500);");
/* ③ 误差-历元曲线：轴名与单位并入标题 */
sub(f, "    C.label(ctx, '首次定位误差 vs 累加历元 N', box.x, box.y - 12, th.fg, 'left', 11, 500);\n    C.label(ctx, '累加历元 N', box.x + box.w, box.y + box.h + 14, th.mutedFg, 'right', 11);\n    C.label(ctx, '误差 (m)', box.x - 6, box.y + 2, th.mutedFg, 'right', 11);",
  "    C.label(ctx, '误差 (m) vs 累加历元 N', box.x, box.y - 12, th.fg, 'left', 11, 500);");
