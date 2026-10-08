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
/* shell：累加历元滑块 + 误差-历元曲线 + 进度条 + 读法 */
sub('shell.html', `      <div class="gl-field">
        <label class="form-label" for="gl-cold-run">逐颗串行搜索（真实计算时间）</label>`,
`      <div class="gl-field">
        <label class="form-label" for="gl-cold-epochs">累加历元 N <span class="tabular-nums" id="gl-cold-epochs-val">8</span></label>
        <input class="form-range" type="range" id="gl-cold-epochs" min="1" max="8" step="1" value="8">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-cold-run">逐颗串行搜索（真实计算时间）</label>`);
sub('shell.html', `      <canvas id="gl-cold-ttff" role="img" aria-label="累计耗时阶梯图：横轴为第 n 颗卫星，纵轴为累计毫秒"></canvas>
    </div>`,
`      <canvas id="gl-cold-ttff" role="img" aria-label="累计耗时阶梯图：横轴为第 n 颗卫星，纵轴为累计毫秒"></canvas>
    </div>
    <canvas id="gl-cold-epoch-canvas" role="img" aria-label="首次定位误差随累加历元数下降的曲线，并给出 1 除以根号 N 的参考线"></canvas>
    <div class="progress gl-progress" role="progressbar" aria-label="冷启动进度" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" id="gl-cold-prog-wrap">
      <div class="progress-bar" id="gl-cold-prog" style="width:0%"></div>
    </div>`);
sub('shell.html', '读法：这是**单历元快照**冷启动——每颗星在 41 个多普勒格上做 4 ms 相干积分，串行搜索的真实计算时间就是蓝条长度。',
  '读法：这是**冷启动 + 多历元平均**——每颗星在 41 个多普勒格上做 4 ms 相干积分，串行搜索的真实计算时间就是蓝条长度；把 N 调大后，同一批卫星的码相位按 √N 律变准（最下面的曲线给出实测值与 1/√N 参考线），这正是跟踪环/长积分的作用。');
/* 绘制：误差-历元曲线 */
sub('app/81-coldstart-draw.js', "  APP.panels.cold.draw = function () {\n    var th = C.theme();\n    perSat(th);\n    ttff(th);\n  };",
`  function epochCurve(th) {
    var st = APP.panels.cold.state;
    var g = C.prep(el('gl-cold-epoch-canvas'), 210), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 54, y: 30, w: Math.max(60, w - 68), h: Math.max(40, h - 60) };
    C.frame(ctx, box, th);
    C.label(ctx, '首次定位误差 vs 累加历元 N', box.x, box.y - 12, th.fg, 'left', 11, 500);
    C.label(ctx, '累加历元 N', box.x + box.w, box.y + box.h + 14, th.mutedFg, 'right', 11);
    C.label(ctx, '误差 (m)', box.x - 6, box.y + 2, th.mutedFg, 'right', 11);
    var cur = st.errCurve || [];
    var pts = [];
    for (var i = 0; i < cur.length; i++) if (isFinite(cur[i].err)) pts.push(cur[i]);
    if (!pts.length) { C.label(ctx, '运行后显示', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var ymax = C.niceMax(Math.max.apply(null, pts.map(function (p) { return p.err; })) * 1.12);
    function X(n) { return box.x + (n - 1) / Math.max(1, cur.length - 1) * box.w; }
    function Y(v) { return box.y + box.h - Math.min(v, ymax) / ymax * box.h; }
    for (var t = 0; t <= 4; t++) {
      var v = ymax * t / 4, y = Y(v);
      if (t > 0) C.hLine(ctx, box.x, box.x + box.w, y, C.withAlpha(th.border, 0.6));
      C.label(ctx, C.fmt(v, 0), box.x - 6, y, th.mutedFg, 'right', 11);
    }
    for (var n = 1; n <= cur.length; n++) C.label(ctx, n + '', X(n), box.y + box.h + 14, th.mutedFg, 'center', 11);
    /* 1/√N 参考线 */
    var e1 = pts[0].err;
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = C.withAlpha(th.mutedFg, 0.9); ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (var k = 1; k <= cur.length; k++) { var px = X(k), py = Y(e1 / Math.sqrt(k)); if (k === 1) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke(); ctx.restore();
    /* 实测曲线 */
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.8; ctx.beginPath();
    for (var j = 0; j < pts.length; j++) { var x2 = X(pts[j].n), y2 = Y(pts[j].err); if (j === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); }
    ctx.stroke();
    ctx.fillStyle = th.s1;
    for (var m = 0; m < pts.length; m++) { ctx.beginPath(); ctx.arc(X(pts[m].n), Y(pts[m].err), 3, 0, Math.PI * 2); ctx.fill(); }
    var lastP = pts[pts.length - 1];
    C.label(ctx, 'N=' + lastP.n + ' → ' + C.fmt(lastP.err, 0) + ' m', X(lastP.n) - 8, Y(lastP.err) - 12, th.fg, 'right', 11, 500);
    C.label(ctx, '虚线＝' + C.fmt(e1, 0) + '/√N 参考', box.x + 4, box.y + box.h - 10, th.mutedFg, 'left', 11);
  }

  APP.panels.cold.draw = function () {
    var th = C.theme();
    perSat(th);
    ttff(th);
    epochCurve(th);
  };`);
