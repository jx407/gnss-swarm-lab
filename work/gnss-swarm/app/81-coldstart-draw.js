/* 面板九绘制：逐星捕获耗时 + 累计 TTFF 阶梯 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core;
  function el(id) { return document.getElementById(id); }

  function perSat(th) {
    var st = APP.panels.cold.state;
    var cv0 = el('gl-cold-canvas');
    var np = ((cv0 && cv0.clientWidth) || 900) < 560;   /* 窄屏：行更高、只画一行标注、绘图区加宽（Volta 图表审计 #2） */
    var g = C.prep(cv0, Math.max(200, st.items.length * (np ? 46 : 30) + 64)), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: np ? 46 : 74, y: 30, w: Math.max(60, w - (np ? 58 : 210)), h: Math.max(40, h - 56) };
    C.frame(ctx, box, th);
    var stc = APP.panels.cold.state;
    C.label(ctx, np ? (stc.mode === 'dll' ? '首历元捕获耗时 (ms)（＝TTFF）' : '每颗星每历元捕获耗时 (ms)')
                    : (stc.mode === 'dll' ? '首历元二维捕获耗时 (ms) —— 这一项构成 TTFF' : '每颗星每历元的二维捕获耗时 (ms) —— 41 个多普勒格 × 4 ms'),
      box.x, box.y - 12, th.fg, 'left', 11, 500);
    if (!st.items.length) { C.label(ctx, '点「执行冷启动」开始', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var tmax = 0, i;
    for (i = 0; i < st.items.length; i++) tmax = Math.max(tmax, st.items[i].ms);
    tmax = C.niceMax(tmax * 1.1);
    function X(v) { return box.x + v / tmax * box.w; }
    for (var t = 0; t <= 4; t++) {
      var v = tmax * t / 4, x = X(v);
      if (t > 0) C.gridV(ctx, x, box.y, box.y + box.h, th);
      /* 边缘感知：右端刻度（如 1000）居中会溢出画布 0.9 px（独立审计实读到 clip） */
      C.labelTick(ctx, C.fmt(v, 0), x, box.x, box.x + box.w, box.y + box.h + 14, th.mutedFg, 11);
    }
    var rowH = box.h / st.items.length;
    for (i = 0; i < st.items.length; i++) {
      var it = st.items[i], y = box.y + i * rowH;
      ctx.fillStyle = C.withAlpha(th.s1, it.detected ? 0.85 : 0.3);
      if (np) {
        var barH = Math.max(7, rowH * 0.42);
        ctx.fillRect(box.x, y + 3, Math.max(1.5, X(it.ms) - box.x), barH);
        C.label(ctx, it.prn, box.x - 6, y + 3 + barH / 2, th.fg, 'right', 11, 500);
        C.label(ctx, C.fmt(it.ms, 0) + ' ms · 峰 ' + C.fmt(it.peakSigma, 1) + 'σ · 码 ' + C.fmt(it.chipsErrM, 0) + ' m · 多普勒 ' + C.fmt(it.dopErr, 0) + ' Hz',
          box.x, y + 3 + barH + 13, th.mutedFg, 'left', 11);
      } else {
        ctx.fillRect(box.x, y + 5, Math.max(1.5, X(it.ms) - box.x), Math.max(5, rowH - 10));
        C.label(ctx, it.prn, box.x - 8, y + rowH / 2, th.fg, 'right', 11, 500);
        C.label(ctx, C.fmt(it.ms, 0) + ' ms · 峰 ' + C.fmt(it.peakSigma, 1) + 'σ', X(it.ms) + 6, y + rowH / 2 - 6, th.fg, 'left', 11);
        C.label(ctx, '码相位误差 ' + C.fmt(it.chipsErrM, 0) + ' m · 多普勒误差 ' + C.fmt(it.dopErr, 0) + ' Hz', X(it.ms) + 6, y + rowH / 2 + 7, th.mutedFg, 'left', 11);
      }
    }
  }

  function ttff(th) {
    var st = APP.panels.cold.state;
    /* 窄屏降低画布高度（ds4.1 代理 Sagan 实测：210→170 后 fillText 包围盒 0 越界，省 ~40 px） */
    var cvT = el('gl-cold-ttff');
    var g = C.prep(cvT, ((cvT && cvT.clientWidth) || 900) < 560 ? 170 : 210), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 54, y: 30, w: Math.max(60, w - 68), h: Math.max(40, h - 60) };
    C.frame(ctx, box, th);
    C.label(ctx, w < 560 ? '累计耗时 (ms) vs 第 n 颗（TTFF 阶梯）'
                        : '累计耗时 (ms) · 横轴＝第 n 颗（TTFF 阶梯）· 纵轴＝累计毫秒（本机 JS 真实计算时间）',
      box.x, box.y - 12, th.fg, 'left', 11, 500);
    if (!st.items.length) { C.label(ctx, '等待开始…', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var cum = 0, pts = [0];
    for (var i = 0; i < st.items.length; i++) { cum += st.items[i].ms; pts.push(cum); }
    var ymax = C.niceMax(cum * 1.15);
    function X(idx) { return box.x + idx / st.items.length * box.w; }
    function Y(v) { return box.y + box.h - v / ymax * box.h; }
    for (var t = 0; t <= 4; t++) {
      var v = ymax * t / 4, y = Y(v);
      if (t > 0) C.gridH(ctx, box.x, box.x + box.w, y, th);
      C.label(ctx, C.fmt(v, 0), box.x - 6, y, th.mutedFg, 'right', 11);
    }
    for (var k = 1; k <= st.items.length; k++) C.label(ctx, k + '', X(k), box.y + box.h + 14, th.mutedFg, 'center', 11);
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.8; ctx.beginPath();
    for (var j = 0; j < pts.length; j++) {
      var x = X(j), y2 = Y(pts[j]);
      if (j === 0) ctx.moveTo(x, y2); else { ctx.lineTo(x, Y(pts[j - 1])); ctx.lineTo(x, y2); }
    }
    ctx.stroke();
    ctx.fillStyle = th.s2;
    ctx.beginPath(); ctx.arc(X(st.items.length), Y(cum), 4, 0, Math.PI * 2); ctx.fill();
    C.label(ctx, '首次定位 ' + C.fmt(cum, 0) + ' ms' + (isFinite(st.err) ? ' · 误差 ' + C.fmt(st.err, 0) + ' m' : ''), X(st.items.length) - 8, Y(cum) - 12, th.fg, 'right', 11, 500);
  }

  function epochCurve(th) {
    var st = APP.panels.cold.state;
    var cvE = el('gl-cold-epoch-canvas');
    var np2 = ((cvE && cvE.clientWidth) || 900) < 560;
    var g = C.prep(cvE, np2 ? 214 : 234), ctx = g.ctx, w = g.w, h = g.h;   /* 窄屏 244→214（Sagan 实测 0 文字越界） */
    var box = { x: np2 ? 42 : 54, y: 30, w: Math.max(60, w - (np2 ? 56 : 68)), h: Math.max(40, h - (np2 ? 92 : 84)) };
    C.frame(ctx, box, th);
    var dll = st.mode === 'dll';
    C.label(ctx, dll ? '误差 (m) vs 跟踪历元' : '误差 (m) vs 累加历元 N', box.x, box.y - 12, th.fg, 'left', 11, 500);
    var cur = st.errCurve || [];
    var pts = [];
    for (var i = 0; i < cur.length; i++) if (isFinite(cur[i].err)) pts.push(cur[i]);
    if (!pts.length) { C.label(ctx, '运行后显示', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var chips = (st.chipCurve || []).filter(function (p) { return isFinite(p.rms); });
    var allVals = pts.map(function (p) { return p.err; }).concat(chips.map(function (p) { return p.rms; }));
    var ymax = C.niceMax(Math.max.apply(null, allVals) * 1.12);
    function X(n) { return box.x + (n - 1) / Math.max(1, cur.length - 1) * box.w; }
    function Y(v) { return box.y + box.h - Math.min(v, ymax) / ymax * box.h; }
    for (var t = 0; t <= 4; t++) {
      var v = ymax * t / 4, y = Y(v);
      if (t > 0) C.gridH(ctx, box.x, box.x + box.w, y, th);
      C.label(ctx, C.fmt(v, 0), box.x - 6, y, th.mutedFg, 'right', 11);
    }
    for (var n = 1; n <= cur.length; n++) C.labelTick(ctx, n + '', X(n), box.x, box.x + box.w, box.y + box.h + 14, th.mutedFg, 11);
    /* 1/√N 参考线：只对"独立测量 + 平均"才有意义；跟踪态是逐历元递推，画它是误导 */
    var e1 = pts[0].err;
    if (!dll) {
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = C.withAlpha(th.mutedFg, 0.9); ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var k = 1; k <= cur.length; k++) { var px = X(k), py = Y(e1 / Math.sqrt(k)); if (k === 1) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke(); ctx.restore();
    }
    /* 实测曲线 */
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.8; ctx.beginPath();
    for (var j = 0; j < pts.length; j++) { var x2 = X(pts[j].n), y2 = Y(pts[j].err); if (j === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); }
    ctx.stroke();
    ctx.fillStyle = th.s1;
    for (var m = 0; m < pts.length; m++) { ctx.beginPath(); ctx.arc(X(pts[m].n), Y(pts[m].err), 3, 0, Math.PI * 2); ctx.fill(); }
    var lastP = pts[pts.length - 1];
    var lastTxt = 'N=' + lastP.n + ' → ' + C.fmt(lastP.err, 0) + ' m';
    ctx.font = C.font(11, 500);
    var lastX = X(lastP.n) - 8;
    /* 默认右对齐（与原版一致）；只有整段会越过绘图区左边界时才改左对齐（N=1 时会发生） */
    var lastFlip = (lastX - ctx.measureText(lastTxt).width < box.x);
    C.label(ctx, lastTxt, lastFlip ? box.x + 4 : lastX, Y(lastP.err) - 12, th.fg, lastFlip ? 'left' : 'right', 11, 500);
    /* 码相位误差 RMS（6 颗星平均，收敛更平滑） */
    if (chips.length) {
      ctx.strokeStyle = th.s2; ctx.lineWidth = 1.8; ctx.beginPath();
      for (var c2 = 0; c2 < chips.length; c2++) { var xc = X(chips[c2].n), yc = Y(chips[c2].rms); if (c2 === 0) ctx.moveTo(xc, yc); else ctx.lineTo(xc, yc); }
      ctx.stroke();
      ctx.fillStyle = th.s2;
      for (var c3 = 0; c3 < chips.length; c3++) { ctx.beginPath(); ctx.arc(X(chips[c3].n), Y(chips[c3].rms), 2.6, 0, Math.PI * 2); ctx.fill(); }

    }
    /* 载波平滑（Costas 环 + Hatch）：精度阶梯的第二级 */
    var hatch = (st.hatchCurve || []).filter(function (p) { return isFinite(p.err); });
    if (hatch.length) {
      ctx.save(); ctx.setLineDash([2, 2]); ctx.strokeStyle = th.s4; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (var h = 0; h < hatch.length; h++) { var xh = X(hatch[h].n), yh = Y(hatch[h].err); if (h === 0) ctx.moveTo(xh, yh); else ctx.lineTo(xh, yh); }
      ctx.stroke(); ctx.restore();

    }

    /* 导航滤波器（8 维 CV 卡尔曼）：把逐历元解算再平滑一遍 */
    var kf = (st.kfCurve || []).filter(function (p) { return isFinite(p.err); });
    if (kf.length) {
      ctx.save(); ctx.setLineDash([6, 3]); ctx.strokeStyle = th.s3; ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (var q = 0; q < kf.length; q++) { var xq = X(kf[q].n), yq = Y(kf[q].err); if (q === 0) ctx.moveTo(xq, yq); else ctx.lineTo(xq, yq); }
      ctx.stroke(); ctx.restore();

    }
    /* 图例承载全部数值（末端标注已删，避免多条标注互相压） */
    var lgA = '— 定位误差 ' + C.fmt(pts[pts.length - 1].err, 0) + ' m' + (dll ? '（跟踪态逐历元）' : '')
            + (chips.length ? ' · — 码相位 RMS ' + C.fmt(chips[chips.length - 1].rms, 0) + ' m' : '');
    var lgB = (hatch.length ? '⋯ 载波平滑 ' + C.fmt(hatch[hatch.length - 1].err, 0) + ' m' : '')
            + (kf.length ? (hatch.length ? ' · ' : '') + '⋯ 卡尔曼 ' + C.fmt(kf[kf.length - 1].err, 0) + ' m' : '')
            + (dll ? '' : ' · 虚线＝' + C.fmt(e1, 0) + '/√N 参考');
    /* 图例一律画在绘图框**下方**（Ramanujan 探针实测：≥560px 时画在框内会压住曲线）；
       宽度够就一行，不够就拆两行（420 px 分支按实测本来就放不下单行） */
    var lgOne = lgA + (lgB ? ' · ' + lgB : '');
    ctx.font = C.font(11);
    if (ctx.measureText(lgOne).width <= w - box.x - 6) {
      C.labelFit(ctx, lgOne, box.x, box.y + box.h + 30, w - box.x - 6, th.mutedFg, 'left', 11);
    } else {
      C.labelFit(ctx, lgA, box.x, box.y + box.h + 30, w - box.x - 6, th.mutedFg, 'left', 11);
      if (lgB) C.labelFit(ctx, lgB, box.x, box.y + box.h + 44, w - box.x - 6, th.mutedFg, 'left', 11);
    }
  }

  APP.panels.cold.draw = function () {
    var th = C.theme();
    perSat(th);
    ttff(th);
    epochCurve(th);
  };
})();
