/* 面板八绘制：延迟-仰角曲线 与 误差-改正比例曲线 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }

  function delayCurves(th) {
    var st = APP.panels.atm.state;
    var g = C.prep(el('gl-atm-canvas'), 300), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 52, y: 40, w: Math.max(40, w - 66), h: Math.max(40, h - 74) };
    C.frame(ctx, box, th);
    C.labelFit(ctx, '延迟 (m) 随仰角变化', box.x, box.y - 24, box.w - 3 * 54 - 12, th.fg, 'left', 11, 500);   /* 右侧给图例留位，超长自适应缩小 */
    C.label(ctx, '仰角 (°)', box.x + box.w, box.y + box.h + 28, th.mutedFg, 'right', 11);
    if (!st.geo || !G.atmosDelay) { C.label(ctx, '加载中…', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var rec = st.geo.rec, b = { x: 0, y: 0, z: 0 };
    var la = APP.state.lat * Math.PI / 180, lo = APP.state.lon * Math.PI / 180;
    var E = { x: -Math.sin(lo), y: Math.cos(lo), z: 0 };
    var N = { x: -Math.sin(la) * Math.cos(lo), y: -Math.sin(la) * Math.sin(lo), z: Math.cos(la) };
    var U = { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) };
    var az = st.delays.length && st.delays[0] ? st.delays[0] : null;
    var azDeg = 90;
    var ions = [], trops = [], tots = [], els = [];
    for (var el2 = 5; el2 <= 90; el2 += 5) {
      var a = azDeg * Math.PI / 180, e2 = el2 * Math.PI / 180;
      var dir = {
        x: Math.cos(e2) * Math.sin(a) * E.x + Math.cos(e2) * Math.cos(a) * N.x + Math.sin(e2) * U.x,
        y: Math.cos(e2) * Math.sin(a) * E.y + Math.cos(e2) * Math.cos(a) * N.y + Math.sin(e2) * U.y,
        z: Math.cos(e2) * Math.sin(a) * E.z + Math.cos(e2) * Math.cos(a) * N.z + Math.sin(e2) * U.z
      };
      var sat = { x: rec.x + dir.x * 2e7, y: rec.y + dir.y * 2e7, z: rec.z + dir.z * 2e7 };
      var d = G.atmosDelay(rec, sat, 6 * 3600, { fHz: st.fMHz * 1e6, relHumidity: st.rh, heightM: 50, alpha: (APP.panels.atm.state && APP.panels.atm.ionoAlpha) ? APP.panels.atm.ionoAlpha() : undefined });
      els.push(el2); ions.push(d.ionoM); trops.push(d.tropoM); tots.push(d.totalM);
    }
    var ymax = C.niceMax(Math.max.apply(null, tots) * 1.05);
    function X(v) { return box.x + (v - 5) / 85 * box.w; }
    function Y(v) { return box.y + box.h - v / ymax * box.h; }
    for (var t = 0; t <= 4; t++) {
      var vv = ymax * t / 4, y = Y(vv);
      if (t > 0) C.gridH(ctx, box.x, box.x + box.w, y, th);
      C.label(ctx, C.fmt(vv, vv < 10 ? 1 : 0), box.x - 6, y, th.mutedFg, 'right', 11);
    }
    for (var e3 = 10; e3 <= 90; e3 += 20) C.labelTick(ctx, e3 + '', X(e3), box.x, box.x + box.w, box.y + box.h + 14, th.mutedFg, 11);
    var series = (w < 340)
      ? [[trops, th.s2, '对流'], [ions, th.s1, '电离'], [tots, th.s3, '总']]
      : [[trops, th.s2, '对流层'], [ions, th.s1, '电离层'], [tots, th.s3, '合计']];
    for (var s = 0; s < series.length; s++) {
      ctx.strokeStyle = series[s][1]; ctx.lineWidth = 1.8; ctx.beginPath();
      for (var i2 = 0; i2 < els.length; i2++) {
        var px = X(els[i2]), py = Y(series[s][0][i2]);
        if (i2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      var lgx = box.x + box.w - 34 - (2 - s) * 54;   /* 图例：色样画在文字左侧，文字位置不动 */
      ctx.strokeStyle = series[s][1]; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(lgx - 17, box.y - 24 + 0.5); ctx.lineTo(lgx - 4, box.y - 24 + 0.5); ctx.stroke();
      C.label(ctx, series[s][2], lgx, box.y - 24, th.fg, 'left', 11, 500);
    }
    for (var k = 0; k < st.delays.length; k++) {
      var dl = st.delays[k];
      if (!dl || !dl.valid || dl.elevDeg < 5) continue;
      ctx.fillStyle = C.withAlpha(th.fg, 0.55);
      ctx.beginPath(); ctx.arc(X(dl.elevDeg), Y(Math.min(dl.totalM, ymax)), 2.6, 0, Math.PI * 2); ctx.fill();
    }
    C.label(ctx, '圆点＝当前参与解算的卫星', box.x + 6, box.y + box.h - 10, th.mutedFg, 'left', 11);
  }

  function errorCurve(th) {
    var st = APP.panels.atm.state;
    var g = C.prep(el('gl-atm-err-canvas'), 300), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 52, y: 40, w: Math.max(40, w - 66), h: Math.max(40, h - 74) };
    C.frame(ctx, box, th);
    C.label(ctx, '水平误差 (m) vs 改正比例', box.x, box.y - 24, th.fg, 'left', 11, 500);
    C.label(ctx, '改正比例 (%)', box.x + box.w, box.y + box.h + 28, th.mutedFg, 'right', 11);
    if (!st.curve || !st.curve.length) { C.label(ctx, '加载中…', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var ymax = C.niceMax(Math.max(0.5, st.curve[0].h * 1.1));
    function X(f) { return box.x + f * box.w; }
    function Y(v) { return box.y + box.h - Math.min(v, ymax) / ymax * box.h; }
    for (var t = 0; t <= 4; t++) {
      var vv = ymax * t / 4, y = Y(vv);
      if (t > 0) C.gridH(ctx, box.x, box.x + box.w, y, th);
      C.label(ctx, C.fmt(vv, 2), box.x - 6, y, th.mutedFg, 'right', 11);
    }
    for (var p = 0; p <= 100; p += 25) C.labelTick(ctx, p + '', X(p / 100), box.x, box.x + box.w, box.y + box.h + 14, th.mutedFg, 11);
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.8; ctx.beginPath();
    for (var i = 0; i < st.curve.length; i++) {
      var px = X(st.curve[i].f), py = Y(st.curve[i].h);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    var cx = X(st.corr), cy = Y(st.errNow);
    ctx.fillStyle = th.s2;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    var right = cx > box.x + box.w - 132;   /* 按剩余宽度翻转，避免长标签右越界（Nash 实测 0.8px 溢出） */
    C.label(ctx, '当前 ' + Math.round(st.corr * 100) + '% → ' + C.fmt(st.errNow, 2) + ' m', cx + (right ? -8 : 8), cy - 12, th.fg, right ? 'right' : 'left', 11, 500);
    C.label(ctx, '0% 未改正 ' + C.fmt(st.curve[0].h, 2) + ' m', box.x + 6, box.y + box.h - 22, th.mutedFg, 'left', 11);
    C.label(ctx, '100% 全改正 ' + C.fmt(st.curve[st.curve.length - 1].h, 2) + ' m', box.x + 6, box.y + box.h - 8, th.mutedFg, 'left', 11);
  }

  APP.panels.atm.draw = function () {
    var th = C.theme();
    delayCurves(th);
    errorCurve(th);
  };
})();
