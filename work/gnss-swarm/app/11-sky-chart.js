/* 面板一：24 小时 DOP 曲线 + 面板渲染入口 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, S = APP.state;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }

  function drawDop(snap) {
    var th = C.theme();
    var g = C.prep(el('gl-dop-canvas'), 300), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 42, y: 34, w: Math.max(40, w - 58), h: Math.max(40, h - 66) };
    var s = APP.panels.sky.dopSeries();
    var vals = [];
    for (var i = 0; i < s.pdop.length; i++) { if (isFinite(s.pdop[i])) vals.push(s.pdop[i]); if (isFinite(s.vdop[i])) vals.push(s.vdop[i]); if (isFinite(s.hdop[i])) vals.push(s.hdop[i]); }
    var ymax = C.niceMax(Math.max(1, Math.max.apply(null, vals)));
    function X(hv) { return box.x + (hv / 24) * box.w; }
    function Y(v) { return box.y + box.h - (v / ymax) * box.h; }
    C.frame(ctx, box, th);
    for (var t = 0; t <= 4; t++) {
      var v = ymax * t / 4, y = Y(v);
      if (t > 0) C.gridH(ctx, box.x, box.x + box.w, y, th);
      C.label(ctx, C.fmt(v, v < 10 && v % 1 !== 0 ? 1 : 0), box.x - 8, y, th.mutedFg, 'right', 11);
    }
    for (var hh = 0; hh <= 24; hh += 6) {
      var x = X(hh);
      C.gridV(ctx, x, box.y, box.y + box.h, th);
      C.label(ctx, hh + '', x, box.y + box.h + 12, th.mutedFg, 'center', 11);
    }
    C.label(ctx, 'DOP', box.x - 8, box.y - 16, th.mutedFg, 'right', 11);
    C.label(ctx, 't (h)', box.x + box.w, box.y + box.h + 26, th.mutedFg, 'right', 11);
    var series = [['PDOP', s.pdop, th.s1], ['HDOP', s.hdop, th.s2], ['VDOP', s.vdop, th.s3]];
    for (var k = 0; k < series.length; k++) {
      ctx.strokeStyle = series[k][2]; ctx.lineWidth = 1.8; ctx.beginPath();
      var pen = false;
      for (var j = 0; j < s.h.length; j++) {
        var val = series[k][1][j];
        if (!isFinite(val)) { pen = false; continue; }
        var px = X(s.h[j]), py = Y(val);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      var lgx = box.x + 26 + k * 52;   /* 图例：色样 + 中性文字（色样 13 px + 4 px 间距，项距 52 与原 46+字宽 的右缘基本一致） */
      ctx.strokeStyle = series[k][2]; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(lgx - 17, box.y - 16 + 0.5); ctx.lineTo(lgx - 4, box.y - 16 + 0.5); ctx.stroke();
      C.label(ctx, series[k][0], lgx, box.y - 16, th.mutedFg, 'left', 11, 500);
    }
    var cx = X(S.hours);
    C.vLine(ctx, cx, box.y, box.y + box.h, C.withAlpha(th.fg, 0.45), 1);
    for (var m = 0; m < 3; m++) {
      var idx = Math.round(S.hours / 0.5), vv = series[m][1][idx];
      if (isFinite(vv)) { ctx.fillStyle = series[m][2]; ctx.beginPath(); ctx.arc(cx, Y(vv), 3, 0, Math.PI * 2); ctx.fill(); }
    }
    C.label(ctx, '+' + C.fmt(S.hours, 1) + 'h', cx + (cx > box.x + box.w - 40 ? -6 : 6), box.y + 10, th.mutedFg, cx > box.x + box.w - 40 ? 'right' : 'left', 11);
  }

  function render() {
    if (!APP.panels.sky.snapshot) return;
    var th = C.theme();
    var snap = APP.panels.sky.snapshot();
    APP.panels.sky.drawSky(snap);
    drawDop(snap);
    if (APP.panels.sky.drawDoppler) APP.panels.sky.drawDoppler(th);
    setText('gl-sky-n', snap.vis.length + '');
    setText('gl-sky-n-ctx', '掩膜 ' + S.mask + '° · 在轨 ' + (APP.satsAt(S.hours * 3600).length) + ' 颗' + (APP.sysCountsText ? '（' + APP.sysCountsText(APP.satsAt(S.hours * 3600)) + '）' : ''));
    setText('gl-sky-pdop', snap.dop.ok ? C.fmt(snap.dop.pdop, 2) : '—');
    setText('gl-sky-gdop', snap.dop.ok ? C.fmt(snap.dop.gdop, 2) : '—');
    var s = APP.panels.sky.dopSeries();
    var best = Infinity, bestH = 0;
    for (var i = 0; i < s.pdop.length; i++) if (isFinite(s.pdop[i]) && s.pdop[i] < best) { best = s.pdop[i]; bestH = s.h[i]; }
    var detail;
    if (S.selPrn) {
      var hit = null;
      for (var k = 0; k < snap.all.length; k++) if (String(snap.all[k].prn) === String(S.selPrn)) hit = snap.all[k];
      var dv = APP.panels.sky.currentDoppler ? APP.panels.sky.currentDoppler() : NaN;
      detail = hit ? ('PRN ' + hit.prn + ' · 方位 ' + C.fmt(hit.azDeg, 1) + '° · 仰角 ' + C.fmt(hit.elDeg, 1) + '° · 距离 ' + C.fmtKm(hit.rangeM) + (isFinite(dv) ? ' · 多普勒 ' + Math.round(dv) + ' Hz' : '')) : '';
    } else {
      detail = '可见 ' + snap.vis.length + ' 颗（' + (APP.sysCountsText ? APP.sysCountsText(snap.vis) : '') + '） · 24 h 内最小 PDOP ' + C.fmt(best, 2) + '（t+' + C.fmt(bestH, 1) + ' h）';
    }
    setText('gl-sky-detail', detail);
    S.rendered = true;
  }
  APP.panels.sky.render = render;
  APP.panels.sky.setHours = function (hv) {
    S.hours = Math.max(0, Math.min(24, hv));
    var inp = el('gl-hours');
    if (inp) { inp.value = S.hours.toFixed(2); }
    setText('gl-hours-val', S.hours.toFixed(1) + ' h');
  };
})();
