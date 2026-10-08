/* 面板二：C/A 码与相关性质 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  var state = { prn: 1, prn2: 8 };

  function corr(a, b, lag) {
    var n = a.length, s = 0, j = ((lag % n) + n) % n;
    for (var i = 0; i < n; i++) { s += a[i] * b[j]; if (++j === n) j = 0; }
    return s;
  }
  function stats() {
    var a = G.caCode(state.prn), b = G.caCode(state.prn2);
    var maxAuto = 0, maxCross = 0;
    for (var l = 1; l < a.length; l++) { var v = Math.abs(corr(a, a, l)); if (v > maxAuto) maxAuto = v; }
    for (var m = 0; m < a.length; m++) { var c = Math.abs(corr(a, b, m)); if (c > maxCross) maxCross = c; }
    var ones = 0;
    for (var k = 0; k < a.length; k++) if (a[k] === 1) ones++;
    return { maxAuto: maxAuto, maxCross: maxCross, ones: ones, minus: a.length - ones };
  }
  function drawChips() {
    var th = C.theme(), code = G.caCode(state.prn);
    var g = C.prep(el('gl-chip-canvas'), 74), ctx = g.ctx, w = g.w, h = g.h;
    var n = 64, pad = 34, cw = (w - pad - 6) / n;
    C.label(ctx, '前 64 chip', 0, 12, th.mutedFg, 'left', 11);
    C.label(ctx, '+1', 26, h / 2, th.fg, 'right', 11);
    for (var i = 0; i < n; i++) {
      var x = pad + i * cw;
      ctx.fillStyle = code[i] === 1 ? th.s1 : C.withAlpha(th.mutedFg, 0.28);
      ctx.fillRect(x + 0.5, h / 2 - 11, Math.max(1, cw - 1.5), 22);
    }
    for (var t = 0; t <= 4; t++) {
      var chip = t * 16;
      C.labelTick(ctx, chip + '', pad + chip * cw, pad, pad + 64 * cw, h - 8, th.mutedFg, 11);
    }
  }
  function drawCorr(canvasId, b, title, note) {
    var th = C.theme(), a = G.caCode(state.prn);
    var g = C.prep(el(canvasId), 216), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 40, y: 26, w: Math.max(40, w - 52), h: Math.max(40, h - 54) };
    var LAG = 64, ymax = 96;
    function X(lag) { return box.x + ((lag + LAG) / (2 * LAG)) * box.w; }
    function Y(v) { return box.y + box.h / 2 - (v / ymax) * (box.h / 2); }
    C.frame(ctx, box, th);
    C.axis0H(ctx, box.x, box.x + box.w, Y(0), th);
    /* t=0 时上面这行已经画过 "0"：原来又在同一坐标画了第二遍（探测器报 textColl 51.6 px²，纯冗余） */
    for (var t = -1; t <= 1; t += 1) C.labelTick(ctx, (t * 64) + '', X(t * LAG), box.x, box.x + box.w, box.y + box.h + 12, th.mutedFg, 11);
    C.label(ctx, 'R(lag)', box.x - 8, box.y - 12, th.mutedFg, 'right', 11);
    /* 单位标注放进绘图区左上角：既不与 x 轴刻度相交，也不与右侧副标题同行相撞（Nash 两轮实测） */
    C.label(ctx, w < 380 ? 'lag (chip)' : '横轴：时延 lag (chip)', box.x + 4, box.y + 12, th.mutedFg, 'left', 10);
    C.labelFit(ctx, title, box.x + 2, box.y - 12, box.w - 96, th.fg, 'left', 12, 500);   /* 右侧给 note 留位，超长自适应缩小 */
    for (var tg = -64; tg <= 64; tg += 32) if (tg !== 0) C.gridV(ctx, X(tg), box.y, box.y + box.h, th);
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.8; ctx.beginPath();
    for (var lag = -LAG; lag <= LAG; lag++) {
      var v = corr(a, b, lag);
      if (v > ymax) v = ymax;
      if (v < -ymax) v = -ymax;
      var px = X(lag), py = Y(v);
      if (lag === -LAG) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    var peak = corr(a, b, 0);
    ctx.strokeStyle = th.s2; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(0), box.y + 2); ctx.lineTo(X(0), box.y + box.h - 2); ctx.stroke();
    C.label(ctx, peak > 0 ? '峰 ' + peak : '峰 ' + peak, X(0) + (peak > 0 ? 8 : -8), box.y + 10, th.s2, peak > 0 ? 'left' : 'right', 11, 500);
    C.label(ctx, note, box.x + box.w - 2, box.y - 12, th.mutedFg, 'right', 11);
  }
  function render() {
    var st = stats();
    drawChips();
    drawCorr('gl-auto-canvas', G.caCode(state.prn), 'PRN ' + state.prn + ' 自相关', '旁瓣只有 63 / -1 / -65');
    drawCorr('gl-cross-canvas', G.caCode(state.prn2), 'PRN ' + state.prn + ' × PRN ' + state.prn2, '互相关上界 65');
    setText('gl-ca-auto', st.maxAuto + '');
    setText('gl-ca-cross', st.maxCross + '');
    setText('gl-ca-bal', G.CA_LEN + ' / ' + st.ones + ':' + st.minus);
    var chips = G.caChips ? G.caChips(state.prn) : null, s = '';
    if (chips) for (var i = 0; i < 10; i++) s += chips[i];
    setText('gl-ca-detail', 'PRN ' + state.prn + ' 前 10 chip：' + s + ' · 峰值 lag=0 时 R=1023，旁瓣最大绝对值 ' + st.maxAuto);
  }
  APP.panels.ca = { render: render, state: state,
    init: function () {
      var a = el('gl-prn'), b = el('gl-prn2'), opt = '';
      for (var i = 1; i <= 32; i++) opt += '<option value="' + i + '">PRN ' + i + '</option>';
      a.innerHTML = opt; b.innerHTML = opt;
      a.value = state.prn; b.value = state.prn2;
      a.addEventListener('change', function () { state.prn = parseInt(a.value, 10); render(); });
      b.addEventListener('change', function () { state.prn2 = parseInt(b.value, 10); render(); });
    } };
})();
