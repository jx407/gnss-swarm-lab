/* 面板三：二维捕获搜索（运行、动画、统计） */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  var st = { prn: 7, phase: 312.5, dop: 2300, snr: -20, result: null, elapsed: 0, reveal: 1, sig: null };
  var raf = null;
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  function updateStats() {
    var r = st.result;
    if (!r) return;
    setText('gl-acq-p', C.fmt(r.codePhaseChips, 2) + ' chip');
    setText('gl-acq-p-ctx', '真实 ' + C.fmt(st.phase, 2) + ' chip · 误差 ' + C.fmt(Math.abs(r.codePhaseChips - st.phase), 2) + ' chip');
    setText('gl-acq-f', (r.dopplerHz >= 0 ? '+' : '') + Math.round(r.dopplerHz) + ' Hz');
    setText('gl-acq-f-ctx', '真实 ' + (st.dop >= 0 ? '+' : '') + Math.round(st.dop) + ' Hz · 误差 ' + Math.round(Math.abs(r.dopplerHz - st.dop)) + ' Hz');
    var floor = NaN, sig = NaN;
    if (r.surface && r.peakMetric > 0) {
      var sum = 0;
      for (var i = 0; i < r.surface.length; i++) sum += r.surface[i];
      floor = (sum / r.surface.length) / 1.2533141;
      sig = floor > 0 ? r.peakMetric / floor : NaN;
    }
    setText('gl-acq-ratio', (isFinite(sig) ? C.fmt(sig, 1) + 'σ' : '—') + ' · ' + C.fmt(r.peakRatio, 1) + '×');
    setText('gl-acq-time', '解算 ' + st.elapsed.toFixed(1) + ' ms');
    var cells = Math.round(r.nCode / Math.max(1, r.ms) * r.nDoppler / 1000);
    var verdict = sig < 5.5
      ? '——峰值已与噪声最大值同量级，**这次报出的码相位/多普勒不可信**，需要加大积分时长或换更强的信号。'
      : sig < 7.5
        ? '——属于边缘检测（接近 4.6σ 噪声最大值），结果时对时错，可再多跑几个历元累积。'
        : '——检测余量充足，码相位与多普勒可信。';
    setText('gl-acq-detail', '粗搜 ' + r.nCode + ' × ' + r.nDoppler + ' 格（' + r.codeStepSamples + ' 采样点/格，' + r.ms + ' ms 相干积分）再精修；相关峰 ' + C.fmt(sig, 1) + 'σ，而折叠后 ' + cells + 'k 个噪声格的最大值统计上约 4.6σ' + verdict);
  }
  function setProgress(v) {
    var wrap = el('gl-acq-prog-wrap'), bar = el('gl-acq-prog');
    if (bar) bar.style.width = Math.round(v * 100) + '%';
    if (wrap) wrap.setAttribute('aria-valuenow', Math.round(v * 100));
  }
  function reveal() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (reduced()) { st.reveal = 1; setProgress(1); APP.panels.acq.draw(); return; }
    var t0 = performance.now(), dur = 620;
    function step(now) {
      var p = Math.min(1, (now - t0) / dur);
      st.reveal = p * p * (3 - 2 * p);
      setProgress(st.reveal);
      APP.panels.acq.draw();
      if (p < 1) raf = requestAnimationFrame(step); else { raf = null; setProgress(1); }
    }
    raf = requestAnimationFrame(step);
  }
  function run() {
    if (!G.acquire || !G.makeSignal) { setText('gl-acq-detail', '捕获模块未加载。'); return; }
    var btn = el('gl-acq-run');
    if (btn) btn.disabled = true;
    setText('gl-acq-detail', '正在做 4 ms 相干积分…');
    setTimeout(function () {
      st.sig = G.makeSignal({ prn: st.prn, codePhase: st.phase, dopplerHz: st.dop, snrDb: st.snr, ms: 4, seed: 20261005 });
      var t0 = performance.now();
      st.result = G.acquire(st.sig, {});
      st.elapsed = performance.now() - t0;
      if (btn) btn.disabled = false;
      updateStats();
      st.reveal = 0; setProgress(0);
      reveal();
    }, 0);
  }
  APP.panels.acq = { state: st, run: run, draw: function () { }, updateStats: updateStats,
    setDoppler: function (v) {
      st.dop = Math.max(-5000, Math.min(5000, Math.round(v / 50) * 50));
      var inp = el('gl-acq-dop');
      if (inp) inp.value = st.dop;
      setText('gl-acq-dop-val', (st.dop >= 0 ? '+' : '') + Math.round(st.dop) + ' Hz');
      setText('gl-acq-detail', '真值多普勒已按卫星几何设为 ' + (st.dop >= 0 ? '+' : '') + Math.round(st.dop) + ' Hz —— 点「开始捕获」看它落在哪个多普勒格。');
    },
    init: function () {
      var sel = el('gl-acq-prn'), opt = '';
      for (var i = 1; i <= 32; i++) opt += '<option value="' + i + '">PRN ' + i + '</option>';
      sel.innerHTML = opt; sel.value = st.prn;
      sel.addEventListener('change', function () { st.prn = parseInt(sel.value, 10); });
      function bind(id, key, valId, fmt) {
        var inp = el(id);
        inp.value = st[key];
        setText(valId, fmt(st[key]));
        inp.addEventListener('input', function () { st[key] = parseFloat(inp.value); setText(valId, fmt(st[key])); });
      }
      bind('gl-acq-phase', 'phase', 'gl-acq-phase-val', function (v) { return C.fmt(v, 2) + ' chip'; });
      bind('gl-acq-dop', 'dop', 'gl-acq-dop-val', function (v) { return (v >= 0 ? '+' : '') + Math.round(v) + ' Hz'; });
      bind('gl-acq-snr', 'snr', 'gl-acq-snr-val', function (v) { return Math.round(v) + ' dB'; });
      el('gl-acq-run').addEventListener('click', run);
    } };
})();
