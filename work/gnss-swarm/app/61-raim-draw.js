/* 面板六绘制：归一化残差条形图 + 误差散点对比 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core;
  function el(id) { return document.getElementById(id); }

  function residBars(th) {
    var st = APP.panels.raim.state;
    var g = C.prep(el('gl-raim-resid'), 300), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 48, y: 30, w: Math.max(40, w - 62), h: Math.max(40, h - 56) };
    C.frame(ctx, box, th);
    C.labelFit(ctx, '归一化残差 nmr（超过阈值即判定粗差）', box.x, box.y - 12, box.x + box.w - 38 - box.x, th.fg, 'left', 11, 500);   /* 长标题自适应；右端给 "PRN" 角标留位（320 px 实测 43 px 重叠） */
    var last = st.last;
    if (!last) { C.label(ctx, '点「运行检核」', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var items = [];
    if (last.stats && last.stats.normalizedResiduals && last.stats.normalizedResiduals.length) {
      for (var i = 0; i < last.stats.normalizedResiduals.length; i++) {
        var q = last.stats.normalizedResiduals[i];
        items.push({ prn: q.prn != null ? q.prn : (i + 1), v: Number(q.value != null ? q.value : q), index: (q.index != null ? q.index : i) });
      }
    } else if (last.residuals && last.residuals.length) {
      var mx = 0;
      for (var j = 0; j < last.residuals.length; j++) mx = Math.max(mx, Math.abs(last.residuals[j]));
      for (var k = 0; k < last.residuals.length; k++) items.push({ prn: last.sats[k] ? last.sats[k].prn : k + 1, v: last.residuals[k] / (mx || 1) * 5 });
      C.label(ctx, '（模块未返回 nmr 数组，这里按残差归一化近似画）', box.x, box.y + box.h + 13, th.mutedFg, 'left', 11);
    }
    var thr = last.stats && Number.isFinite(last.stats.threshold) ? last.stats.threshold : 5;
    var ymax = C.niceMax(Math.max(thr * 1.3, Math.max.apply(null, items.map(function (it) { return Math.abs(it.v) || 0; })) * 1.1));
    var cy = box.y + box.h / 2;
    function Y(v) { return cy - v / ymax * (box.h / 2 - 6); }
    C.axis0H(ctx, box.x, box.x + box.w, cy, th);
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = C.withAlpha(th.s2, 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(box.x, Y(thr)); ctx.lineTo(box.x + box.w, Y(thr)); ctx.moveTo(box.x, Y(-thr)); ctx.lineTo(box.x + box.w, Y(-thr)); ctx.stroke();
    ctx.restore();
    C.label(ctx, '阈值 ' + C.fmt(thr, 1), box.x + 4, Y(thr) - 8, th.s2, 'left', 11, 500);
    C.label(ctx, '+' + C.fmt(ymax, 1), box.x - 6, Y(ymax), th.mutedFg, 'right', 11);
    C.label(ctx, '0', box.x - 6, cy, th.mutedFg, 'right', 11);
    C.label(ctx, '-' + C.fmt(ymax, 1), box.x - 6, Y(-ymax), th.mutedFg, 'right', 11);
    var step = box.w / items.length;
    for (var n = 0; n < items.length; n++) {
      var it = items[n], isOut = (it.index === last.idx), overThr = Math.abs(it.v) > thr;
      var x = box.x + n * step + step * 0.25, bw = step * 0.5;
      var y0 = cy, y1 = Y(Math.max(-ymax, Math.min(ymax, it.v)));
      ctx.fillStyle = isOut ? C.withAlpha(th.s2, 0.95) : (overThr ? C.withAlpha(th.s2, 0.42) : C.withAlpha(th.s1, 0.75));
      ctx.fillRect(x, Math.min(y0, y1), bw, Math.max(1.5, Math.abs(y1 - y0)));
      C.label(ctx, '' + it.prn, x + bw / 2, box.y + box.h + 13, th.mutedFg, 'center', 11);
      if (isOut) C.label(ctx, '剔除 ' + C.fmt(it.v, 1), x + bw / 2, Y(it.v) - 9, th.fg, 'center', 11, 500);
      else if (overThr) C.label(ctx, C.fmt(it.v, 1), x + bw / 2, Y(it.v) - 9, th.mutedFg, 'center', 11);
    }
    C.label(ctx, 'PRN', box.x + box.w, box.y - 12, th.mutedFg, 'right', 11);
  }

  function scatter(th) {
    var st = APP.panels.raim.state;
    var g = C.prep(el('gl-raim-scatter'), 300), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 44, y: 30, w: Math.max(40, w - 58), h: Math.max(40, h - 56) };
    C.frame(ctx, box, th);
    C.label(ctx, '20 次解算的东北平面偏移', box.x, box.y - 12, th.fg, 'left', 11, 500);
    var pts = [];
    for (var i = 0; i < st.runs.length; i++) {
      var r = st.runs[i];
      if (r.pE) pts.push(r.pE);
      if (r.rE) pts.push(r.rE);
    }
    if (!pts.length) { C.label(ctx, '点「运行检核」', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var lim = 0;
    for (var j = 0; j < pts.length; j++) lim = Math.max(lim, Math.abs(pts[j].e), Math.abs(pts[j].n));
    lim = C.niceMax(Math.max(1, lim * 1.15));
    var half = Math.min(box.w, box.h) / 2 - 8, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    function X(v) { return cx + v / lim * half; }
    function Y(v) { return cy - v / lim * half; }
    C.axis0H(ctx, box.x, box.x + box.w, cy, th);
    C.axis0V(ctx, cx, box.y, box.y + box.h, th);
    C.label(ctx, '东 (m)', box.x + box.w, box.y + box.h + 13, th.mutedFg, 'right', 11);
    C.label(ctx, '北 (m)', box.x - 6, box.y + 2, th.mutedFg, 'right', 11);
    C.label(ctx, '+' + C.fmt(lim, 1), box.x + box.w, cy - 8, th.mutedFg, 'right', 11);
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.8;
    for (var k = 0; k < st.runs.length; k++) {
      var p = st.runs[k].pE;
      if (!p) continue;
      ctx.beginPath(); ctx.arc(X(p.e), Y(p.n), 3.6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = C.withAlpha(th.s1, 0.85);
    for (var m = 0; m < st.runs.length; m++) {
      var q = st.runs[m].rE;
      if (!q) continue;
      ctx.beginPath(); ctx.arc(X(q.e), Y(q.n), 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = th.fg; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke();
    C.label(ctx, '空心 = 普通 LS（被粗差拖走）', box.x + 4, box.y + box.h - 22, th.mutedFg, 'left', 11);
    C.label(ctx, '实心 = RAIM 排除后重解', box.x + 4, box.y + box.h - 8, th.mutedFg, 'left', 11);
  }

  function plStrip(th) {
    var st = APP.panels.raim.state;
    var g = C.prep(el('gl-raim-pl'), 116), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 44, y: 26, w: Math.max(40, w - 58), h: 34 };
    C.frame(ctx, box, th);
    C.label(ctx, '水平误差 / HPL / 告警限 (m)', box.x, box.y - 12, th.fg, 'left', 11, 500);
    if (!st.pl || !st.pl.ok) { C.label(ctx, '保护限级不可用（几何不足或模块未加载）', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var errs = [];
    for (var i = 0; i < st.runs.length; i++) { var p = st.runs[i].rE; if (p) errs.push(Math.hypot(p.e, p.n)); }   /* 与 HPL 同口径：排除粗差后的解 */
    if (!errs.length) return;
    var AL = 40, lim = C.niceMax(Math.max(st.pl.hpl, AL, Math.max.apply(null, errs)) * 1.12);
    function X(v) { return box.x + Math.min(v, lim) / lim * box.w; }
    var sorted = errs.slice().sort(function (a, b) { return a - b; });
    var p95 = sorted[Math.min(sorted.length - 1, Math.round(0.95 * (sorted.length - 1)))];
    var mx = sorted[sorted.length - 1];
    ctx.fillStyle = C.withAlpha(th.s1, 0.35);
    ctx.fillRect(box.x, box.y + 5, Math.max(1.5, X(p95) - box.x), box.h - 10);
    ctx.fillStyle = th.s1;
    ctx.beginPath(); ctx.arc(X(mx), box.y + box.h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
    var lines = [[st.pl.hpl, th.s2, 'HPL ' + C.fmt(st.pl.hpl, 1)], [AL, th.mutedFg, '告警限 ' + AL], [st.pl.vpl, C.withAlpha(th.s3, 0.9), 'VPL ' + C.fmt(st.pl.vpl, 1)]];
    for (var k = 0; k < lines.length; k++) {
      var x = X(lines[k][0]);
      ctx.save(); ctx.setLineDash(k === 1 ? [5, 4] : [4, 3]); ctx.strokeStyle = lines[k][1]; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x, box.y - 4); ctx.lineTo(x, box.y + box.h + 4); ctx.stroke(); ctx.restore();
      C.labelTick(ctx, lines[k][2], x, box.x, box.x + box.w, box.y + box.h + (k === 0 ? 13 : (k === 1 ? 27 : 41)), lines[k][1], 11);
    }
    C.labelFit(ctx, 'RAIM 后最大 ' + C.fmt(mx, 1) + ' m（95 分位 ' + C.fmt(p95, 1) + ' m）', X(mx) + 8, box.y + 12, w - (X(mx) + 8) - 4, th.fg, 'left', 11, 500);
  }

  APP.panels.raim.draw = function () {
    var th = C.theme();
    residBars(th);
    scatter(th);
    plStrip(th);
  };
})();
