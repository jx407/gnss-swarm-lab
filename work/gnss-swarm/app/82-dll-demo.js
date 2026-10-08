/* 面板九附：码跟踪环 vs 快照平均（同一颗卫星、同一批噪声种子）
 * 逻辑全部走已判据化的成品模块 GNSS.trackDll（CONTRACT-v8.md §14），
 * 这里是"把两种策略放到同一动态下比一比"的可视化外壳。 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }

  var FS = 4092000, DOPH = 1200, N = 20, PRN = 1, CA = 1023;
  var CHIP_M = G.CONST.c / G.CONST.F_CODE;
  var st = { slope: 0.27, running: false, data: null };
  function wrapChip(d) { while (d > CA / 2) d -= CA; while (d < -CA / 2) d += CA; return d; }

  function buildSignals(slope) {
    var sigs = [], truth = [], e;
    for (e = 0; e < N; e++) {
      var cp = 412.3 + slope * e;
      truth.push(cp);
      var sig = G.makeSignal({ prn: PRN, codePhase: cp, dopplerHz: DOPH, snrDb: -20, ms: 4, seed: 5100 + e * 37, fs: FS });
      sig.codePhase = 999.5;              /* 防作弊：真值字段写假，模块只能看采样 */
      sig.trueCodePhaseSamples = 3998;
      sigs.push(sig);
    }
    return { sigs: sigs, truth: truth };
  }
  /* 快照平均：每历元独立捕获 + 精修（与冷启动面板同一套估计器），再对 1..N 累加平均 */
  function snapshotAverage(sigs, truth) {
    var out = [], base = null, runSum = 0, e;
    var refine = APP.panels.cold && APP.panels.cold.refinePhase;
    for (e = 0; e < N; e++) {
      var r = G.acquire(sigs[e], {});
      var refined = refine ? refine(sigs[e], r.codePhaseSamples, r.dopplerHz) : r.codePhaseSamples;
      var g = ((refined * CA / (FS * 0.001)) % CA + CA) % CA;
      if (base === null) base = g;
      runSum += wrapChip(g - base);
      var mean = ((base + runSum / (e + 1)) % CA + CA) % CA;
      out.push(Math.abs(wrapChip(mean - truth[e])) * CHIP_M);
    }
    return out;
  }
  function run() {
    if (st.running) return;
    if (!G.trackDll) { setText('gl-dll-note', '跟踪环模块 GNSS.trackDll 未加载（构建清单里缺 winners/dll.js）。'); return; }
    st.running = true;
    setText('gl-dll-note', '计算中：20 历元捕获 + 窄相关…');
    setTimeout(function () {
      var built = buildSignals(st.slope);
      var loop = G.trackDll(built.sigs, {});
      var avg = snapshotAverage(built.sigs, built.truth);
      var loopErr = loop.chips.map(function (g, i) { return Math.abs(wrapChip(g - built.truth[i])) * CHIP_M; });
      st.data = { avg: avg, loop: loopErr, locked: loop.locked, slope: st.slope,
        avgLast: avg[N - 1], loopLast: loopErr[N - 1],
        avgMean: avg.slice(10).reduce(function (a, b) { return a + b; }, 0) / 10,
        loopMean: loopErr.slice(10).reduce(function (a, b) { return a + b; }, 0) / 10 };
      st.running = false;
      draw();
      var d = st.data;
      setText('gl-dll-note', '每历元漂移 ' + st.slope.toFixed(2) + ' chip（' + (st.slope * CHIP_M).toFixed(0) + ' m/历元）· 后 10 历元平均误差：快照平均 '
        + d.avgMean.toFixed(0) + ' m，二阶跟踪环 ' + d.loopMean.toFixed(0) + ' m'
        + (d.avgMean > 0 ? '（环路好 ' + (d.avgMean / Math.max(1, d.loopMean)).toFixed(1) + ' 倍）' : '')
        + ' · locked=' + d.locked + ' · 4 spc 量化误差上限 ±' + (0.125 * CHIP_M).toFixed(0) + ' m（平台中心 RMS 下限 21 m）');
    }, 0);
  }

  function draw() {
    var cv = el('gl-dll-canvas');
    if (!cv) return;
    var p = C.prep(cv, cv.clientWidth < 560 ? 190 : 230), ctx = p.ctx, th = C.theme();   /* 窄屏 230→190（Sagan 实测 0 文字越界） */
    var box = { x: 46, y: 14, w: p.w - 60, h: p.h - 46 };
    C.frame(ctx, box, th);
    var d = st.data;
    if (!d) {
      C.label(ctx, '点「跑 20 历元…」开始对比', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12);
      return;
    }
    var yMax = C.niceMax(Math.max(Math.max.apply(null, d.avg), Math.max.apply(null, d.loop), 1) * 1.15);
    var X = function (i) { return box.x + box.w * i / (N - 1); };
    var Y = function (v) { return box.y + box.h - box.h * Math.min(1, v / yMax); };
    for (var k = 0; k <= 4; k++) {
      var v = yMax * k / 4;
      C.gridH(ctx, box.x, box.x + box.w, Y(v), th);
      C.label(ctx, C.fmt(v, 0) + ' m', box.x - 6, Y(v), th.mutedFg, 'right', 10);
    }
    /* 采样量化下限 ±0.125 chip */
    var floor = 0.125 * (G.CONST.c / G.CONST.F_CODE);
    var yf = Y(floor), yu = Y(-floor);
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = th.s4; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(box.x, yf); ctx.lineTo(box.x + box.w, yf); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(box.x, yu); ctx.lineTo(box.x + box.w, yu); ctx.stroke(); ctx.restore();
    C.label(ctx, '4 spc 量化误差上限 ±' + floor.toFixed(0) + ' m（RMS 下限 21 m）', box.x + 4, yf - 8, th.s4, 'left', 10);
    function line(data, col) {
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      for (var i = 0; i < data.length; i++) { var x = X(i), y = Y(data[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    line(d.avg, th.s2); line(d.loop, th.s1);
    C.label(ctx, '历元 N', box.x + box.w, box.y + box.h + 12, th.mutedFg, 'right', 10);
    C.label(ctx, '码相位误差', box.x, box.y - 6, th.mutedFg, 'left', 10);
    C.label(ctx, '快照平均 ' + C.fmt(d.avgLast, 0) + ' m', box.x + box.w - 4, box.y + 14, th.s2, 'right', 11, 500);
    C.label(ctx, '二阶跟踪环 ' + C.fmt(d.loopLast, 0) + ' m', box.x + box.w - 4, box.y + 30, th.s1, 'right', 11, 500);
  }

  APP.panels.dll = {
    state: st, run: run, draw: draw,
    init: function () {
      var sl = el('gl-dll-slope');
      if (sl) {
        sl.value = st.slope;
        setText('gl-dll-slope-val', st.slope.toFixed(2) + ' chip');
        sl.addEventListener('input', function () {
          st.slope = parseFloat(sl.value);
          setText('gl-dll-slope-val', st.slope.toFixed(2) + ' chip');
        });
      }
      var b = el('gl-dll-run');
      if (b) b.addEventListener('click', run);
    }
  };
})();
