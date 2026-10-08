/* 面板十：载波跟踪环（Costas PLL）——逻辑
 * 数据链：makeSignal（含载波初相）→ correlateIQ 取 prompt I/Q → 鉴相 → PI 环路 → 本振相位
 * 全部走已判据化的成品模块 GNSS.pllTrack（CONTRACT-v10.md §16）。 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }

  var FS = 4092000, CP = 412.3, F_TRUE = 1200, PRN = 1, N = 40, DT = 0.005, FLIP_AT = 20;
  var st = { order: 2, disc: 'costas', fRes: 2, snrDb: -20, flip: true, running: false, hasRun: false, res: null };
  function alphaOf() { return st.order === 2 ? 0.4 : 0.15; }
  function betaOf() { return st.order === 2 ? 0.02 : 0; }
  function deg(rad) { return rad * 180 / Math.PI; }
  function wrapPi(x) { return Math.atan2(Math.sin(x), Math.cos(x)); }

  function run() {
    if (st.running) return;
    if (typeof G.pllTrack !== 'function') { setText('gl-pll-detail', '载波环模块 GNSS.pllTrack 未加载。'); return; }
    st.running = true;
    setText('gl-pll-detail', '计算中：40 历元 × 4 ms 相干积分 + 环路递推…');
    setTimeout(function () {
      var truth = [], carrier = [], epochs = [], e;
      var flipAt = st.flip ? FLIP_AT : -1;
      for (e = 0; e < N; e++) {
        /* 载波相位轨迹 = 残余多普勒引起的线性相位；（可选）180° 数据位翻转是**数据**、不是载波：
           它加进信号里，但不能算进"载波相位误差"，否则 Costas 环会被错误地判为大误差。 */
        var car = 2 * Math.PI * st.fRes * DT * e;
        var phi = car + (flipAt >= 0 && e >= flipAt ? Math.PI : 0);
        truth.push(phi); carrier.push(car);
        var sig = G.makeSignal({ prn: PRN, codePhase: CP, dopplerHz: F_TRUE, carrierPhaseRad: phi,
          snrDb: st.snrDb, ms: 4, seed: 777 + e * 13, fs: FS });
        sig.carrierPhaseRad = 999;                 /* 防偷看：真值字段写假 */
        epochs.push({ t: DT, sig: sig });
      }
      var t0 = performance.now();
      var out = G.pllTrack(epochs, { codeChips: CP, fNco0: F_TRUE, alpha: alphaOf(), beta: betaOf(), disc: st.disc });
      var ms = performance.now() - t0;
      var off = G.chipsToCorrelateOffset(CP, FS), errs = [], iq = [], k;
      for (k = 0; k < N; k++) {
        var applied = k === 0 ? 0 : out.phase[k - 1];      /* 本历元实际用到的本振相位 */
        errs.push(wrapPi(carrier[k] - applied));           /* 误差对"载波"，数据位翻转不进来 */
        var q = G.correlateIQ(epochs[k].sig, off, F_TRUE, applied, epochs[k].sig.ms);
        iq.push({ i: q.I, q: q.Q, e: k });
      }
      st.res = { truth: truth, carrier: carrier, phase: out.phase, freq: out.freq, disc: out.disc, errs: errs, iq: iq,
        locked: out.locked, ms: ms, flipAt: flipAt, order: st.order, discMode: st.disc, fRes: st.fRes, snrDb: st.snrDb };
      st.hasRun = true; st.running = false;
      draw(); updateStats();
    }, 0);
  }
  function draw() { if (APP.panels.pll.draw) APP.panels.pll.draw(); }

  function updateStats() {
    var r = st.res;
    if (!r) {
      setText('gl-pll-rms', '—'); setText('gl-pll-freq', '—'); setText('gl-pll-lock', '—');
      return;
    }
    var seg = r.errs.slice(20), fseg = r.freq.slice(20), i;
    var rms = Math.sqrt(seg.reduce(function (a, b) { return a + b * b; }, 0) / seg.length);
    var fMean = fseg.reduce(function (a, b) { return a + b; }, 0) / fseg.length;
    var maxD = 0;
    for (i = 20; i < r.disc.length; i++) maxD = Math.max(maxD, Math.abs(r.disc[i]));
    setText('gl-pll-rms', rms.toFixed(3) + ' rad');
    setText('gl-pll-rms-ctx', deg(rms).toFixed(1) + '° · 后 20 历元 · 用时 ' + r.ms.toFixed(0) + ' ms');
    setText('gl-pll-freq', fMean.toFixed(2) + ' Hz');
    setText('gl-pll-freq-ctx', '真值 ' + r.fRes.toFixed(1) + ' Hz');
    setText('gl-pll-lock', r.locked ? '已锁定' : '未锁定');
    setText('gl-pll-lock-ctx', '稳态 max|d| ' + maxD.toFixed(3) + ' rad · ' +
      (r.discMode === 'costas' ? 'Costas' : 'atan2') + ' · ' + (r.order === 2 ? '二阶' : '一阶'));
    setText('gl-pll-detail', (r.flipAt >= 0 ? '第 ' + r.flipAt + ' 历元插入 180° 数据位翻转；' : '无数据位翻转；') +
      '鉴相器 ' + (r.discMode === 'costas' ? 'Costas I·Q/(I²+Q²)' : 'atan2(Q,I)') + '，' +
      (r.order === 2 ? '二阶 PI（α=0.4, β=0.02）' : '一阶（α=0.15, β=0）') +
      '，残余多普勒 ' + r.fRes.toFixed(1) + ' Hz、信噪比 ' + r.snrDb + ' dB：稳态相位误差 rms ' +
      rms.toFixed(3) + ' rad（' + deg(rms).toFixed(1) + '°），频差估计 ' + fMean.toFixed(2) + ' Hz，' +
      (r.locked ? '环路锁定' : '未锁定') + '。');
  }

  APP.panels.pll = {
    state: st, run: run, updateStats: updateStats,
    init: function () {
      var o = el('gl-pll-order'), d = el('gl-pll-disc'), f = el('gl-pll-fres'), s = el('gl-pll-snr'), c = el('gl-pll-flip');
      if (o) { o.value = String(st.order); o.addEventListener('change', function () { st.order = parseInt(o.value, 10); run(); }); }
      if (d) { d.value = st.disc; d.addEventListener('change', function () { st.disc = d.value; run(); }); }
      if (f) {
        f.value = String(st.fRes); setText('gl-pll-fres-val', st.fRes.toFixed(1) + ' Hz');
        f.addEventListener('input', function () { st.fRes = parseFloat(f.value); setText('gl-pll-fres-val', st.fRes.toFixed(1) + ' Hz'); });
        f.addEventListener('change', function () { run(); });
      }
      if (s) {
        s.value = String(st.snrDb); setText('gl-pll-snr-val', st.snrDb + ' dB');
        s.addEventListener('input', function () { st.snrDb = parseInt(s.value, 10); setText('gl-pll-snr-val', st.snrDb + ' dB'); });
        s.addEventListener('change', function () { run(); });
      }
      if (c) { c.checked = st.flip; c.addEventListener('change', function () { st.flip = c.checked; run(); }); }
      var b = el('gl-pll-run');
      if (b) b.addEventListener('click', run);
    }
  };
})();
