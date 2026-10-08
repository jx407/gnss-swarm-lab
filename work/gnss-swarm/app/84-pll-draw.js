/* 面板十绘制：I/Q 星座 + 相位误差/鉴别器曲线 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core;
  function el(id) { return document.getElementById(id); }

  function iqCanvas(th) {
    var st = APP.panels.pll.state;
    var g = C.prep(el('gl-pll-iq'), 250), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 10, y: 26, w: Math.max(80, w - 20), h: Math.max(60, h - 40) };
    C.frame(ctx, box, th);
    C.label(ctx, '解调后 I/Q 星座（每历元一点，深色＝后期）', box.x, box.y - 12, th.fg, 'left', 11, 500);
    var r = st.res;
    if (!r) { C.label(ctx, '点「跑载波环」开始', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var i, maxA = 0;
    for (i = 0; i < r.iq.length; i++) maxA = Math.max(maxA, Math.hypot(r.iq[i].i, r.iq[i].q));
    if (!(maxA > 0)) maxA = 1;
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2, R = Math.min(box.w, box.h) * 0.40;
    ctx.strokeStyle = C.withAlpha(th.border, 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, box.y + 4); ctx.lineTo(cx, box.y + box.h - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(box.x + 4, cy); ctx.lineTo(box.x + box.w - 4, cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    C.label(ctx, '+I', cx + R + 5, cy, th.mutedFg, 'left', 10);
    C.label(ctx, '+Q', cx, cy - R - 9, th.mutedFg, 'center', 10);
    for (i = 0; i < r.iq.length; i++) {
      var p = r.iq[i], t = r.iq.length > 1 ? i / (r.iq.length - 1) : 1;
      ctx.fillStyle = C.mix(th.mutedFg, th.s1, t);
      ctx.beginPath();
      ctx.arc(cx + p.i / maxA * R, cy - p.q / maxA * R, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (r.flipAt >= 0 && r.iq[r.flipAt]) {
      var pf = r.iq[r.flipAt];
      var xf = cx + pf.i / maxA * R, yf = cy - pf.q / maxA * R;
      ctx.strokeStyle = th.s2; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(xf, yf, 7.5, 0, Math.PI * 2); ctx.stroke();
      C.label(ctx, '翻转历元', xf + 10, yf, th.s2, 'left', 10);
    }
    C.label(ctx, '半径按最大相关幅度归一；锁定后点应聚到 +I 方向', box.x + 4, box.y + box.h - 10, th.mutedFg, 'left', 10);
  }

  function phaseCanvas(th) {
    var st = APP.panels.pll.state;
    var g = C.prep(el('gl-pll-phase'), 250), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 50, y: 26, w: Math.max(60, w - 64), h: Math.max(40, h - 44) };
    C.frame(ctx, box, th);
    C.labelFit(ctx, '相位误差（实线）与鉴别器输出（虚线），单位 rad', box.x, box.y - 12, w - box.x - 4, th.fg, 'left', 11, 500);
    var r = st.res;
    if (!r) { C.label(ctx, '运行后显示', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var i, mag = 0.4;
    for (i = 0; i < r.errs.length; i++) { mag = Math.max(mag, Math.abs(r.errs[i]), Math.abs(r.disc[i] || 0)); }
    var yMax = C.niceMax(mag);
    var X = function (e) { return box.x + box.w * e / (r.errs.length - 1); };
    var Y = function (v) { return box.y + box.h / 2 - Math.max(-1, Math.min(1, v / yMax)) * (box.h / 2); };
    for (var k = -2; k <= 2; k++) {
      var v = yMax * k / 2, y = Y(v);
      if (k !== 0) C.gridH(ctx, box.x, box.x + box.w, y, th);
      C.label(ctx, C.fmt(v, 2), box.x - 6, y, th.mutedFg, 'right', 10);
    }
    C.axis0H(ctx, box.x, box.x + box.w, Y(0), th);
    /* ±0.2 rad 目标带 */
    ctx.fillStyle = C.withAlpha(th.s3, 0.16);
    ctx.fillRect(box.x, Y(0.2), box.w, Y(-0.2) - Y(0.2));
    /* 鉴别器（虚线） */
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = th.s2; ctx.lineWidth = 1.3; ctx.beginPath();
    for (i = 0; i < r.disc.length; i++) { var xd = X(i), yd = Y(r.disc[i]); if (i === 0) ctx.moveTo(xd, yd); else ctx.lineTo(xd, yd); }
    ctx.stroke(); ctx.restore();
    /* 相位误差（实线） */
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.9; ctx.beginPath();
    for (i = 0; i < r.errs.length; i++) { var xe = X(i), ye = Y(r.errs[i]); if (i === 0) ctx.moveTo(xe, ye); else ctx.lineTo(xe, ye); }
    ctx.stroke();
    if (r.flipAt >= 0) {
      var xf2 = X(r.flipAt);
      ctx.save(); ctx.setLineDash([2, 2]); ctx.strokeStyle = th.s4; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(xf2, box.y); ctx.lineTo(xf2, box.y + box.h); ctx.stroke(); ctx.restore();
      C.label(ctx, '数据位翻转', xf2 + 3, box.y + 8, th.s4, 'left', 10);
    }
    C.label(ctx, '历元', box.x + box.w, box.y + box.h + 12, th.mutedFg, 'right', 10);
    C.label(ctx, '— 相位误差 · ⋯ 鉴别器 · ▒ ±0.2 rad', box.x + 4, box.y + box.h - 10, th.mutedFg, 'left', 10);
  }

  APP.panels.pll.draw = function () {
    var th = C.theme();
    iqCanvas(th);
    phaseCanvas(th);
  };
})();
