/* 面板四绘制：等权 vs 高程加权的误差散点 + 最近一次伪距残差 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core;
  function el(id) { return document.getElementById(id); }
  function drms(pts) {
    var s = 0, n = 0;
    for (var i = 0; i < pts.length; i++) { s += pts[i].e * pts[i].e + pts[i].n * pts[i].n; n++; }
    return n ? Math.sqrt(s / n) : NaN;
  }

  function scatter(th, st, height) {
    var g = C.prep(el('gl-pos-scatter'), height), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 40, y: 24, w: Math.max(40, w - 54), h: Math.max(40, h - 72) };
    C.frame(ctx, box, th);
    var u = [], wl = [];
    for (var i = 0; i < st.trials.length; i++) {
      if (st.trials[i].u) u.push(st.trials[i].u);
      if (st.trials[i].w) wl.push(st.trials[i].w);
    }
    if (!u.length && !wl.length) { C.label(ctx, '点「运行 50 次解算」得到东北平面误差分布', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var lim = 0, j;
    for (j = 0; j < u.length; j++) lim = Math.max(lim, Math.abs(u[j].e), Math.abs(u[j].n));
    for (j = 0; j < wl.length; j++) lim = Math.max(lim, Math.abs(wl[j].e), Math.abs(wl[j].n));
    lim = C.niceMax(Math.max(0.5, lim * 1.25));
    var half = Math.min(box.w, box.h) / 2 - 8, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    function X(v) { return cx + v / lim * half; }
    function Y(v) { return cy - v / lim * half; }
    C.axis0H(ctx, box.x, box.x + box.w, cy, th);
    C.axis0V(ctx, cx, box.y, box.y + box.h, th);
    /* 两个 DRMS 圈：等权虚线圈（灰）、加权虚线圈（主色） */
    var rings = [[drms(u), C.withAlpha(th.mutedFg, 0.8), '等权 1×DRMS'], [drms(wl), C.withAlpha(th.s1, 0.95), '加权 1×DRMS']];
    ctx.save();
    ctx.setLineDash([4, 3]);
    for (var k = 0; k < rings.length; k++) {
      if (!isFinite(rings[k][0]) || rings[k][0] <= 0) continue;
      var rr = rings[k][0] / lim * half;
      ctx.strokeStyle = rings[k][1]; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    /* 等权：空心；加权：实心 */
    ctx.strokeStyle = C.withAlpha(th.s1, 0.55); ctx.lineWidth = 1.2;
    for (j = 0; j < u.length; j++) { ctx.beginPath(); ctx.arc(X(u[j].e), Y(u[j].n), 3.6, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = C.withAlpha(th.s1, 0.9);
    for (j = 0; j < wl.length; j++) { ctx.beginPath(); ctx.arc(X(wl[j].e), Y(wl[j].n), 3.4, 0, Math.PI * 2); ctx.fill(); }
    var mu = { e: 0, n: 0 }, mw = { e: 0, n: 0 };
    for (j = 0; j < u.length; j++) { mu.e += u[j].e; mu.n += u[j].n; }
    for (j = 0; j < wl.length; j++) { mw.e += wl[j].e; mw.n += wl[j].n; }
    mu.e /= Math.max(1, u.length); mu.n /= Math.max(1, u.length);
    mw.e /= Math.max(1, wl.length); mw.n /= Math.max(1, wl.length);
    ctx.strokeStyle = th.fg; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke();
    if (u.length) {
      ctx.strokeStyle = C.withAlpha(th.mutedFg, 0.95);
      ctx.beginPath(); ctx.moveTo(X(mu.e) - 6, Y(mu.n)); ctx.lineTo(X(mu.e) + 6, Y(mu.n)); ctx.moveTo(X(mu.e), Y(mu.n) - 6); ctx.lineTo(X(mu.e), Y(mu.n) + 6); ctx.stroke();
    }
    if (wl.length) {
      ctx.strokeStyle = th.s2;
      ctx.beginPath(); ctx.moveTo(X(mw.e) - 6, Y(mw.n)); ctx.lineTo(X(mw.e) + 6, Y(mw.n)); ctx.moveTo(X(mw.e), Y(mw.n) - 6); ctx.lineTo(X(mw.e), Y(mw.n) + 6); ctx.stroke();
    }
    C.label(ctx, '东 (m)', box.x + box.w, box.y + box.h + 13, th.mutedFg, 'right', 11);
    C.label(ctx, '北 (m)', box.x - 6, box.y + 2, th.mutedFg, 'right', 11);
    C.label(ctx, '±' + C.fmt(lim, 1), box.x + box.w, cy - 8, th.mutedFg, 'right', 11);
    var leg = '空心＝等权 · 实心＝高程加权（偏移 ' + C.fmt(Math.hypot(mu.e, mu.n), 2) + ' / ' + C.fmt(Math.hypot(mw.e, mw.n), 2) + ' m）';
    C.labelFit(ctx, leg, box.x, box.y + box.h + 28, w - box.x - 6, th.mutedFg, 'left', 11);
    C.label(ctx, '虚线圈＝各自的 1×DRMS（二维均方根半径）', box.x, box.y + box.h + 43, th.mutedFg, 'left', 11);
  }

  function resid(th, st, height) {
    var g = C.prep(el('gl-pos-resid'), height), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 42, y: 30, w: Math.max(40, w - 56), h: Math.max(40, h - 60) };
    C.frame(ctx, box, th);
    var sol = st.last;
    if (!sol || !sol.residuals || !sol.residuals.length) { C.label(ctx, '残差图在解算后显示', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var res = sol.residuals, prns = st.sats.map(function (s) { return s.prn; });
    var m = 0, i;
    for (i = 0; i < res.length; i++) m = Math.max(m, Math.abs(res[i]));
    var scale = C.niceMax(Math.max(0.05, m * 1.2));
    var cy = box.y + box.h / 2;
    function Y(v) { return cy - v / scale * (box.h / 2 - 8); }
    C.axis0H(ctx, box.x, box.x + box.w, cy, th);
    var step = box.w / res.length, maxI = 0;
    for (i = 0; i < res.length; i++) if (Math.abs(res[i]) > Math.abs(res[maxI])) maxI = i;
    for (i = 0; i < res.length; i++) {
      var x = box.x + i * step + step * 0.22, bw = step * 0.56;
      var y0 = Y(0), y1 = Y(res[i]);
      ctx.fillStyle = C.withAlpha(th.s1, 0.85);
      ctx.fillRect(x, Math.min(y0, y1), bw, Math.max(1.5, Math.abs(y1 - y0)));
      C.label(ctx, '' + prns[i], x + bw / 2, box.y + box.h + 13, th.mutedFg, 'center', 11);
    }
    var mx = box.x + maxI * step + step * 0.5;
    C.label(ctx, (res[maxI] >= 0 ? '+' : '') + C.fmt(res[maxI], 2) + ' m', mx, Y(res[maxI]) - 9, th.fg, 'center', 11, 500);
    C.label(ctx, w < 340 ? '伪距残差 (m)' : '伪距残差 (m)·等权解', box.x, box.y - 10, th.mutedFg, 'left', 11);
    C.label(ctx, '+' + C.fmt(scale, 2), box.x + box.w, box.y + 8, th.mutedFg, 'right', 11);
    var rms = 0;
    for (i = 0; i < res.length; i++) rms += res[i] * res[i];
    C.label(ctx, w < 340
      ? ('RMS ' + C.fmt(Math.sqrt(rms / res.length), 2) + ' · 最大 ' + C.fmt(m, 2))
      : ('RMS ' + C.fmt(Math.sqrt(rms / res.length), 2) + ' m · 最大 ' + C.fmt(m, 2) + ' m'),
      box.x + box.w, box.y - 10, th.fg, 'right', 11, 500);
  }

  /* 电离层三情景（不改正 / 模型改正 / 双频消电离层）水平 RMS 对比 */
  function ionoBars(th, st) {
    var cv = el('gl-pos-iono-canvas');
    if (!cv) return;
    var g = C.prep(cv, 180), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 56, y: 28, w: Math.max(80, w - 72), h: Math.max(50, h - 52) };
    C.frame(ctx, box, th);
    C.label(ctx, '电离层三情景 · 水平定位 RMS（同批噪声）', box.x, box.y - 14, th.fg, 'left', 11, 500);
    var r = st.ionoRes;
    if (!r) { C.label(ctx, '运行后显示', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var bars = (w < 340)
      ? [['不改正', r.none, th.s2], ['模型改正', r.model, th.s3], ['双频', r.dual, th.s1]]
      : [['L1 不改正', r.none, th.s2], ['L1 + 模型改正', r.model, th.s3], ['L1/L2 消电离层', r.dual, th.s1]];
    var vmax = 0, i;
    for (i = 0; i < bars.length; i++) if (isFinite(bars[i][1])) vmax = Math.max(vmax, bars[i][1]);
    vmax = C.niceMax(Math.max(1, vmax) * 1.15);
    var bw = box.w / bars.length;
    for (i = 0; i < bars.length; i++) {
      var v = bars[i][1], hgt = isFinite(v) ? Math.max(1, v / vmax * box.h) : 0;
      var x0 = box.x + i * bw + bw * 0.18, wBar = bw * 0.64;
      ctx.fillStyle = C.withAlpha(bars[i][2], 0.85);
      ctx.fillRect(x0, box.y + box.h - hgt, wBar, hgt);
      var valY = Math.min(box.y + box.h - 36, box.y + box.h - hgt - 9);   /* 值很小时别落到图例上（窄屏图例两行） */
      C.label(ctx, C.fmt(v, 2) + ' m', x0 + wBar / 2, valY, th.fg, 'center', 11, 500);
      C.label(ctx, bars[i][0], x0 + wBar / 2, box.y + box.h + 13, th.mutedFg, 'center', 11);
    }
    var capA = '纵轴 0 → ' + C.fmt(vmax, 1) + ' m · 活跃度 ×' + r.act;
    var capB = 'L1 最大斜距延迟 ' + C.fmt(r.ioMax, 1) + ' m · 组合噪声放大 ' + C.fmt(r.amp, 2) + '×';
    if (box.w < 430) {   /* 窄屏拆两行，避免右越界 */
      C.label(ctx, capA, box.x + 4, box.y + box.h - 22, th.mutedFg, 'left', 10);
      C.label(ctx, capB, box.x + 4, box.y + box.h - 10, th.mutedFg, 'left', 10);
    } else {
      C.label(ctx, capA + ' · ' + capB, box.x + 4, box.y + box.h - 10, th.mutedFg, 'left', 10);
    }
  }

  APP.panels.pos.draw = function () {
    var th = C.theme(), st = APP.panels.pos.state;
    scatter(th, st, 320);
    resid(th, st, 320);
    ionoBars(th, st);
  };
})();
