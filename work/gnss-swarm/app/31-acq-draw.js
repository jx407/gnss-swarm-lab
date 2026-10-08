/* 面板三：搜索面热力图与相关剖面
 * 两个关键处理：① 4 ms 信号里同一码相位出现 4 次（1 ms 码周期别名），显示时折叠成一个码周期；
 * ② 折叠后有 1023 列，直接缩放到几百像素会因最近邻采样"丢列"而丢掉单点峰，
 *    因此按显示像素分桶、每桶取最大值，保证峰一定落在某个像素上。 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core;
  function el(id) { return document.getElementById(id); }

  function buildSurface(r, targetPx) {
    var c = buildSurface.cache;
    if (c && c.r === r && c.targetPx === targetPx) return c;
    var rows = r.nDoppler, rawCols = r.nCode;
    var period = Math.max(1, Math.round(rawCols / Math.max(1, r.ms)));
    var cols = Math.min(period, rawCols);
    var dw = Math.max(1, Math.min(cols, Math.round(targetPx)));
    var bucket = cols / dw;
    var fx = new Float32Array(rows * dw);
    var maxV = 0;
    for (var d = 0; d < rows; d++) {
      for (var x = 0; x < dw; x++) {
        var c0 = Math.floor(x * bucket), c1 = Math.max(c0 + 1, Math.floor((x + 1) * bucket));
        var v = 0;
        for (var c = c0; c < c1; c++) {
          for (var k = c; k < rawCols; k += cols) {
            var vv = r.surface[d * rawCols + k];
            if (vv > v) v = vv;
          }
        }
        fx[d * dw + x] = v;
        if (v > maxV) maxV = v;
      }
    }
    var sorted = Array.prototype.slice.call(fx).sort(function (a, b) { return a - b; });
    var lo = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.92))] || 0;
    buildSurface.cache = { r: r, targetPx: targetPx, rows: rows, dw: dw, fx: fx, maxV: maxV, lo: lo, hi: Math.max(maxV, lo * 1.0001, 1e-12) };
    return buildSurface.cache;
  }

  function heat(th, r, height) {
    var g = C.prep(el('gl-acq-canvas'), height), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 54, y: 30, w: Math.max(40, w - 70), h: Math.max(40, h - 56) };
    C.frame(ctx, box, th);
    if (!r) { C.label(ctx, '点「开始捕获」得到 1023 × 41 的相关搜索面', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var f = buildSurface(r, box.w), rows = f.rows, dw = f.dw, span = f.hi - f.lo;
    var vis = Math.max(1, Math.round(rows * APP.panels.acq.state.reveal));
    var off = heat.buf;
    if (!off || off.width !== dw || off.height !== rows) { off = heat.buf = document.createElement('canvas'); off.width = dw; off.height = rows; }
    var oc = off.getContext('2d'), img = oc.createImageData(dw, rows);
    for (var d = 0; d < rows; d++) {
      for (var x = 0; x < dw; x++) {
        var t = span > 0 ? (f.fx[d * dw + x] - f.lo) / span : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var col = C.mix(th.muted, th.s1, Math.pow(t, 0.45));
        var m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(col);
        var px = (d * dw + x) * 4;
        img.data[px] = m ? +m[1] : 128; img.data[px + 1] = m ? +m[2] : 128; img.data[px + 2] = m ? +m[3] : 128;
        img.data[px + 3] = Math.round(95 + 160 * t);
      }
    }
    oc.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, dw, vis, box.x, box.y, box.w, box.h * vis / rows);
    ctx.strokeStyle = C.mix(th.border, th.fg, 0.24);
    ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
    var rowIdx = Math.max(0, Math.min(rows - 1, Math.round((r.dopplerHz - r.dopplerMinHz) / r.dopplerStepHz)));
    var chip = ((r.codePhaseChips % 1023) + 1023) % 1023;
    var px2 = box.x + (chip / 1023) * box.w, py2 = box.y + (rowIdx + 0.5) / rows * box.h;
    ctx.save();
    ctx.strokeStyle = th.fg; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px2 - 9, py2); ctx.lineTo(px2 - 3, py2); ctx.moveTo(px2 + 3, py2); ctx.lineTo(px2 + 9, py2);
    ctx.moveTo(px2, py2 - 7); ctx.lineTo(px2, py2 - 2); ctx.moveTo(px2, py2 + 2); ctx.lineTo(px2, py2 + 7);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = C.withAlpha(th.s1, 0.22);
    ctx.beginPath(); ctx.arc(px2, py2, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    var right = px2 > box.x + box.w - 140;
    C.label(ctx, '峰 ' + C.fmt(r.codePhaseChips, 2) + ' chip / ' + Math.round(r.dopplerHz) + ' Hz',
      px2 + (right ? -12 : 12), Math.max(box.y + 10, py2 - 13), th.fg, right ? 'right' : 'left', 11, 500);
    C.label(ctx, '码相位 (chip，1 ms 码周期内)', box.x, box.y - 10, th.mutedFg, 'left', 11);
    C.label(ctx, '多普勒 (Hz)', box.x + box.w, box.y - 10, th.mutedFg, 'right', 11);
    C.label(ctx, '' + Math.round(r.dopplerMinHz + (rows - 1) * r.dopplerStepHz), box.x - 6, box.y + 1, th.mutedFg, 'right', 11);
    C.label(ctx, '0', box.x - 6, box.y + box.h / 2, th.mutedFg, 'right', 11);
    C.label(ctx, '' + Math.round(r.dopplerMinHz), box.x - 6, box.y + box.h - 1, th.mutedFg, 'right', 11);
    for (var t2 = 0; t2 <= 4; t2++) C.labelTick(ctx, '' + Math.round(t2 * 1023 / 4), box.x + t2 / 4 * box.w, box.x, box.x + box.w, box.y + box.h + 13, th.mutedFg, 11);
    var capNearBottom = (py2 > box.y + box.h - 26);   /* 峰值标签在底部（左下或右下都可能很长）→ 说明换到左上 */
    C.label(ctx, '色彩按搜索面 92% 分位裁剪', box.x + 6, capNearBottom ? box.y + 12 : box.y + box.h - 10, th.mutedFg, 'left', 11);
  }

  function profile(th, r, height) {
    var g = C.prep(el('gl-acq-profile'), height), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 54, y: 26, w: Math.max(40, w - 70), h: Math.max(30, h - 76) };
    C.frame(ctx, box, th);
    if (!r) return;
    var rawCols = r.nCode, cols = Math.max(1, Math.round(rawCols / Math.max(1, r.ms)));
    if (cols > rawCols) cols = rawCols;
    var rows = r.nDoppler;
    var rowIdx = Math.max(0, Math.min(rows - 1, Math.round((r.dopplerHz - r.dopplerMinHz) / r.dopplerStepHz)));
    var vals = new Float32Array(cols), maxV = 0, i, k;
    for (i = 0; i < cols; i++) {
      var v = 0;
      for (k = i; k < rawCols; k += cols) { var vv = r.surface[rowIdx * rawCols + k]; if (vv > v) v = vv; }
      vals[i] = v;
      if (v > maxV) maxV = v;
    }
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.8; ctx.beginPath();
    for (i = 0; i < cols; i++) {
      var y = box.y + box.h - (vals[i] / (maxV || 1)) * (box.h - 8) - 4;
      var x = box.x + (i + 0.5) / cols * box.w;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    var chip = ((r.codePhaseChips % 1023) + 1023) % 1023;
    C.vLine(ctx, box.x + chip / 1023 * box.w, box.y, box.y + box.h, C.withAlpha(th.s2, 0.95), 1.5);
    C.labelFit(ctx, '多普勒 ' + Math.round(r.dopplerHz) + ' Hz 这一行的相关剖面（已折叠到 1 ms 码周期）', box.x, box.y - 10, w - box.x - 4, th.fg, 'left', 11, 500);
    C.label(ctx, '幅度 |R|', box.x - 6, box.y + 2, th.mutedFg, 'right', 11);
    C.label(ctx, '码相位 (chip)', box.x, box.y + box.h + 29, th.mutedFg, 'left', 11);
    C.label(ctx, '0', box.x, box.y + box.h + 13, th.mutedFg, 'center', 11);
    C.label(ctx, '1023', box.x + box.w, box.y + box.h + 13, th.mutedFg, 'right', 11);
  }

  APP.panels.acq.draw = function () {
    var th = C.theme(), r = APP.panels.acq.state.result;
    heat(th, r, 208);
    profile(th, r, 140);
  };
})();
