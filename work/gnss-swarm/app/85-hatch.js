/* 面板十附：载波相位平滑码（Hatch 滤波）——逻辑 + 绘制
 * 走已判据化模块 GNSS.hatchSmooth（CONTRACT-v11.md §17）。 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  var NB = 200, SIG_CODE = 30, SIG_PHASE = 0.01, SLIP_AT = 100, SLIP_CYCLES = 2000, THRESH = 135;
  var LAMBDA = G.CONST.c / 1575.42e6;
  var hs = { window: 0, bias: 15, slip: false, running: false, hasRun: false, res: null };
  function gauss(rnd) { var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function run() {
    if (hs.running) return;
    if (typeof G.hatchSmooth !== 'function') { setText('gl-hatch-detail', '平滑模块 GNSS.hatchSmooth 未加载。'); return; }
    hs.running = true;
    setText('gl-hatch-detail', '计算中：200 历元码/载波 + Hatch 递推…');
    setTimeout(function () {
      var rnd = G.mulberry32(4242), eps = [], truth = [], k;
      for (k = 0; k < NB; k++) {
        var R = 2.1e7 + 5 * k;
        var slip = (hs.slip && k >= SLIP_AT) ? SLIP_CYCLES * LAMBDA : 0;
        truth.push(R);
        eps.push({ prM: R + hs.bias + gauss(rnd) * SIG_CODE, phaseM: R + 1234.5 + gauss(rnd) * SIG_PHASE + slip });
      }
      var out = G.hatchSmooth(eps, { window: hs.window, slipThreshold: hs.slip ? THRESH : 0 });
      var codeErr = [], smoothErr = [];
      for (k = 0; k < NB; k++) { codeErr.push(eps[k].prM - truth[k]); smoothErr.push(out.smoothed[k] - truth[k]); }
      hs.res = { truth: truth, codeErr: codeErr, smoothErr: smoothErr, resets: out.resets, usedN: out.usedN,
        window: hs.window, bias: hs.bias, slip: hs.slip };
      hs.hasRun = true; hs.running = false;
      draw(); updateStats();
    }, 0);
  }
  function segmentStd(a, from) {
    var s = a.slice(from), m = s.reduce(function (x, y) { return x + y; }, 0) / s.length, v = 0, i;
    for (i = 0; i < s.length; i++) v += (s[i] - m) * (s[i] - m);
    return Math.sqrt(v / s.length);
  }
  function updateStats() {
    var r = hs.res;
    if (!r) { setText('gl-hatch-std', '—'); setText('gl-hatch-last', '—'); setText('gl-hatch-resets', '—'); return; }
    var std = segmentStd(r.smoothErr, NB - 50), lastE = r.smoothErr[NB - 1];
    setText('gl-hatch-std', std.toFixed(2) + ' m');
    setText('gl-hatch-std-ctx', '后 50 历元 · 码噪声 ' + SIG_CODE + ' m → 降噪 ' + (SIG_CODE / Math.max(1e-6, std)).toFixed(0) + '×');
    setText('gl-hatch-last', lastE.toFixed(2) + ' m');
    setText('gl-hatch-last-ctx', '初始码偏差 ' + r.bias + ' m' + (r.slip ? ' · 含 2000 周周跳' : ''));
    setText('gl-hatch-resets', r.resets.length + ' 次');
    setText('gl-hatch-resets-ctx', r.slip
      ? ('阈值 4.5σ = ' + THRESH + ' m' + (r.resets.length ? ' · 历元 ' + r.resets.join(', ') : ''))
      : '未启用周跳检测');
    setText('gl-hatch-detail', '窗口 ' + (r.window ? '固定 N=' + r.window : '增长') + '，初始码偏差 ' + r.bias + ' m' +
      (r.slip ? '，第 ' + SLIP_AT + ' 历元插入 2000 周（≈' + (SLIP_CYCLES * LAMBDA).toFixed(0) + ' m）周跳' : '，无周跳') +
      '：平滑后稳态抖动 ' + std.toFixed(2) + ' m，末历元误差 ' + lastE.toFixed(2) + ' m，重置 ' + r.resets.length + ' 次。');
  }

  function draw() {
    var cv = el('gl-hatch-canvas');
    if (!cv) return;
    var g = C.prep(cv, 240), ctx = g.ctx, th = C.theme();
    var box = { x: 54, y: 26, w: Math.max(60, g.w - 68), h: Math.max(40, g.h - 46) };
    C.frame(ctx, box, th);
    C.labelFit(ctx, '误差 (m) vs 历元 —— 原始码伪距（灰）与载波平滑后（蓝）', box.x, box.y - 12, g.w - box.x - 4, th.fg, 'left', 11, 500);
    var r = hs.res;
    if (!r) { C.label(ctx, '点「跑载波平滑」开始', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var lo = 0, hi = 0, i;
    for (i = 0; i < NB; i++) { lo = Math.min(lo, r.codeErr[i], r.smoothErr[i]); hi = Math.max(hi, r.codeErr[i], r.smoothErr[i]); }
    var pad = 0.1 * Math.max(10, hi - lo);
    lo -= pad; hi += pad;
    var X = function (k) { return box.x + box.w * k / (NB - 1); };
    var Y = function (v) { return box.y + box.h - (v - lo) / (hi - lo) * box.h; };
    for (i = 0; i <= 4; i++) {
      var v = lo + (hi - lo) * i / 4;
      C.gridH(ctx, box.x, box.x + box.w, Y(v), th);
      C.label(ctx, C.fmt(v, 0), box.x - 6, Y(v), th.mutedFg, 'right', 10);
    }
    C.hLine(ctx, box.x, box.x + box.w, Y(0), C.withAlpha(th.mutedFg, 0.9));
    /* 原始码误差 */
    ctx.strokeStyle = C.withAlpha(th.mutedFg, 0.55); ctx.lineWidth = 1;
    ctx.beginPath();
    for (i = 0; i < NB; i++) { var xc = X(i), yc = Y(r.codeErr[i]); if (i === 0) ctx.moveTo(xc, yc); else ctx.lineTo(xc, yc); }
    ctx.stroke();
    /* 平滑后 */
    ctx.strokeStyle = th.s1; ctx.lineWidth = 2; ctx.beginPath();
    for (i = 0; i < NB; i++) { var xs = X(i), ys = Y(r.smoothErr[i]); if (i === 0) ctx.moveTo(xs, ys); else ctx.lineTo(xs, ys); }
    ctx.stroke();
    /* 重置点 */
    for (i = 0; i < r.resets.length; i++) {
      var xr = X(r.resets[i]);
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = th.s2; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(xr, box.y); ctx.lineTo(xr, box.y + box.h); ctx.stroke(); ctx.restore();
    }
    if (r.resets.length) C.label(ctx, '周跳重置 ' + r.resets.length + ' 次', X(r.resets[0]) + 4, box.y + 10, th.s2, 'left', 10);
    C.label(ctx, '— 原始码伪距 · — 载波平滑后' + (r.resets.length ? ' · ⋯ 重置' : ''), box.x + 4, box.y + box.h - 10, th.mutedFg, 'left', 10);
    C.label(ctx, '历元', box.x + box.w, box.y + box.h + 12, th.mutedFg, 'right', 10);
  }

  APP.panels.hatch = {
    state: hs, run: run, updateStats: updateStats, draw: draw,
    init: function () {
      var w = el('gl-hatch-window'), b = el('gl-hatch-bias'), c = el('gl-hatch-slip'), btn = el('gl-hatch-run');
      if (w) { w.value = String(hs.window); w.addEventListener('change', function () { hs.window = parseInt(w.value, 10); run(); }); }
      if (b) {
        b.value = String(hs.bias); setText('gl-hatch-bias-val', hs.bias + ' m');
        b.addEventListener('input', function () { hs.bias = parseFloat(b.value); setText('gl-hatch-bias-val', hs.bias + ' m'); });
        b.addEventListener('change', function () { run(); });
      }
      if (c) { c.checked = hs.slip; c.addEventListener('change', function () { hs.slip = c.checked; run(); }); }
      if (btn) btn.addEventListener('click', run);
    }
  };
})();
