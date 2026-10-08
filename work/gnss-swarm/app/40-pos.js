/* 面板四：定位解算（同一批数据上比较等权最小二乘与高程加权最小二乘） */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, S0 = APP.state, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  var st = { sigma: 5, n: 8, trials: [], rec: null, sats: [], sigmas: [], iters: 0, pdop: NaN, pdopW: NaN, ratio: NaN, busy: false,
    ionoAct: 1, ionoRes: null };
  var F_L1 = 1575.42e6, F_L2 = 1227.60e6, K_L1L2 = Math.pow(F_L1 / F_L2, 2), IONO_CORR = 0.7;

  function basis(latDeg, lonDeg) {
    var la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
    return {
      e: { x: -Math.sin(lo), y: Math.cos(lo), z: 0 },
      n: { x: -Math.sin(la) * Math.cos(lo), y: -Math.sin(la) * Math.sin(lo), z: Math.cos(la) },
      u: { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) }
    };
  }
  function enu(latDeg, lonDeg, d) {
    var b = basis(latDeg, lonDeg);
    return { e: d.x * b.e.x + d.y * b.e.y + d.z * b.e.z, n: d.x * b.n.x + d.y * b.n.y + d.z * b.n.z, u: d.x * b.u.x + d.y * b.u.y + d.z * b.u.z };
  }
  function pickBest(list, n, rec) {
    var cur = list.slice();
    while (cur.length > n) {
      var bi = -1, bg = Infinity;
      for (var i = 0; i < cur.length; i++) {
        var t = cur.slice(0, i).concat(cur.slice(i + 1));
        var d = G.dop(t, rec);
        if (d.ok && d.gdop < bg) { bg = d.gdop; bi = i; }
      }
      if (bi < 0) break;
      cur.splice(bi, 1);
    }
    return cur;
  }
  /* 噪声按仰角放大：σ(el) = uereSigma(el)，用相对倍率乘到面板的 σ 上 */
  function relSigma(elDeg) {
    if (!G.uereSigma) return 1;
    var o = { zenithM: 0.5, horizonM: 0.5, elMinDeg: 5 };
    return G.uereSigma(elDeg, o) / G.uereSigma(90, o);
  }
  /* 系统间钟差：多系统时按 MULTI_SYS 的 sysBiasM 注入，真实接收机必须逐系统估钟差 */
  function sysBias(prn) {
    var MS = G.MULTI_SYS;
    if (!MS || !APP.sysOf) return 0;
    var s = APP.sysOf(prn);
    return (MS[s] && Number.isFinite(MS[s].sysBiasM)) ? MS[s].sysBiasM : 0;
  }
  function gauss(rnd) {
    var u1 = 1 - rnd(), u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function geometry() {
    var rec = G.ecefFromGeodetic(S0.lat, S0.lon, 50);
    var pool = G.visible(APP.satsAt(S0.hours * 3600), rec, Math.max(5, S0.mask - 5));
    var chosen = pool.length > st.n ? pickBest(pool, st.n, rec) : pool;
    return { rec: rec, pool: pool.length, sats: chosen.map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }; }) };
  }
  function run() {
    if (st.busy) return;
    var geo = geometry();
    if (geo.sats.length < 4) { setText('gl-pos-detail', '当前掩膜下可见卫星不足 4 颗，无法定位。'); return; }
    st.busy = true;
    setText('gl-pos-detail', G.solveWeighted ? '正在跑 50 次蒙特卡洛（等权 vs 高程加权）…' : '正在跑 50 次蒙特卡洛…（加权模块未加载，只算等权）');
    setTimeout(function () {
      var sigmas = geo.sats.map(function (s) { return st.sigma * relSigma(s.elDeg); });
      /* 电离层斜距延迟（L1）：活跃度来自本面板的下拉，系数复用误差预算面板的 ALPHA0 */
      var A0 = (APP.panels.atm && APP.panels.atm.alpha0) ? APP.panels.atm.alpha0() : [2.5e-8, 0, -1.2e-7, 0];
      var alpha = A0.map(function (v) { return v * st.ionoAct; });
      var ionoL1 = geo.sats.map(function (s) {
        if (typeof G.ionoDelay !== 'function') return 0;
        var r = G.ionoDelay(geo.rec, { x: s.x, y: s.y, z: s.z }, 6 * 3600, { fHz: F_L1, alpha: alpha });
        return (r && isFinite(r.slantM)) ? r.slantM : 0;
      });
      var guess = { x: geo.rec.x + 3000, y: geo.rec.y - 3000, z: geo.rec.z + 3000 };
      var trials = [], iters = 0, pdopW = NaN, naives = [];
      var ionoH = { none: [], model: [], dual: [] };
      for (var k = 0; k < 50; k++) {
        var seed = 9000 + k;
        var meas = G.simulatePseudoranges(geo.sats, geo.rec, { clockBiasM: 120, noiseSigmaM: 0, seed: seed });
        var rnd = G.mulberry32(seed + 7919);
        var noisy = meas.map(function (m, i) {
          return { prn: m.prn, sys: APP.sysOf ? APP.sysOf(m.prn) : 'G', x: m.x, y: m.y, z: m.z, prM: m.prM + sysBias(m.prn) + gauss(rnd) * sigmas[i] };
        });
        var multi = (APP.state.systems || ['G']).length > 1;
        var useIsb = st.useIsb && multi && !!G.solveMulti;
        var u = useIsb ? G.solveMulti(noisy, { guess: guess }) : G.solvePosition(noisy, { guess: guess });
        var w = G.solveWeighted ? (useIsb ? G.solveMulti(noisy, { guess: guess, sigmas: sigmas }) : G.solveWeighted(noisy, { guess: guess, sigmas: sigmas })) : null;
        /* —— 电离层三情景（同一批噪声、同一几何，只换电离层处理方式）—— */
        if (typeof G.ionoFree === 'function') {
          var n1 = geo.sats.map(function () { return gauss(rnd); });
          var n2 = geo.sats.map(function () { return gauss(rnd); });
          function hErrOf(mode) {
            var list = geo.sats.map(function (s, i) {
              var base = meas[i].prM + sysBias(s.prn);
              var I = ionoL1[i];
              if (mode === 'none') return { prn: s.prn, x: s.x, y: s.y, z: s.z, prM: base + I + n1[i] * sigmas[i] };
              if (mode === 'model') return { prn: s.prn, x: s.x, y: s.y, z: s.z, prM: base + (1 - IONO_CORR) * I + n1[i] * sigmas[i] };
              var f1 = base + I + n1[i] * sigmas[i];
              var f2 = base + K_L1L2 * I + n2[i] * sigmas[i];
              return { prn: s.prn, x: s.x, y: s.y, z: s.z, prM: G.ionoFree(f1, f2, F_L1, F_L2) };
            });
            var sol = G.solvePosition(list, { guess: guess });
            if (!sol.ok) return NaN;
            var e = enu(S0.lat, S0.lon, { x: sol.x - geo.rec.x, y: sol.y - geo.rec.y, z: sol.z - geo.rec.z });
            return Math.hypot(e.e, e.n);
          }
          ionoH.none.push(hErrOf('none'));
          ionoH.model.push(hErrOf('model'));
          ionoH.dual.push(hErrOf('dual'));
        }
        var naive = (useIsb && k < 50) ? G.solvePosition(noisy, { guess: guess }) : null;
        var uo = u.ok ? enu(S0.lat, S0.lon, { x: u.x - geo.rec.x, y: u.y - geo.rec.y, z: u.z - geo.rec.z }) : null;
        var wo = w && w.ok ? enu(S0.lat, S0.lon, { x: w.x - geo.rec.x, y: w.y - geo.rec.y, z: w.z - geo.rec.z }) : null;
        trials.push({
          u: uo, w: wo,
          u3: uo ? Math.hypot(uo.e, uo.n, uo.u) : NaN,
          w3: wo ? Math.hypot(wo.e, wo.n, wo.u) : NaN
        });
        if (u.ok) iters += u.iterations;
        if (naive && k === 49) st.lastNaive = { residuals: naive.residuals || [], sats: geo.sats };
        if (naive && naive.ok) { var ne = enu(S0.lat, S0.lon, { x: naive.x - geo.rec.x, y: naive.y - geo.rec.y, z: naive.z - geo.rec.z }); naives.push(Math.hypot(ne.e, ne.n)); }
        if (k === 49) st.last = { residuals: u.residuals || [], sats: geo.sats };
        if (w && Number.isFinite(w.pdop)) pdopW = w.pdop;
      }
      var ud = G.dop(geo.sats, geo.rec);
      st.trials = trials; st.rec = geo.rec; st.sats = geo.sats; st.sigmas = sigmas; st.pool = geo.pool; st.naiveHrms = rmsOf(naives); st.usedIsb = st.useIsb && (APP.state.systems || ['G']).length > 1 && !!G.solveMulti;
      st.iters = iters / 50; st.pdop = ud.ok ? ud.pdop : NaN; st.pdopW = pdopW;
      st.ratio = Math.max.apply(null, sigmas) / Math.min.apply(null, sigmas);
      st.ionoRes = (typeof G.ionoFree === 'function') ? {
        none: rmsOf(ionoH.none), model: rmsOf(ionoH.model), dual: rmsOf(ionoH.dual),
        ioMax: Math.max.apply(null, ionoL1), amp: G.ionoFreeNoiseAmp(F_L1, F_L2), act: st.ionoAct, corr: IONO_CORR
      } : null;
      st.busy = false;
      updateStats(); APP.panels.pos.draw();
    }, 0);
  }
  function rmsOf(a) {
    var s = 0, n = 0;
    for (var i = 0; i < a.length; i++) if (isFinite(a[i])) { s += a[i] * a[i]; n++; }
    return n ? Math.sqrt(s / n) : NaN;
  }
  function updateStats() {
    var uh = [], wh = [], u3 = [], w3 = [];
    for (var i = 0; i < st.trials.length; i++) {
      var t = st.trials[i];
      if (t.u) uh.push(Math.hypot(t.u.e, t.u.n));
      if (t.w) wh.push(Math.hypot(t.w.e, t.w.n));
      u3.push(t.u3); w3.push(t.w3);
    }
    var ru = rmsOf(uh), rw = rmsOf(wh), ru3 = rmsOf(u3), rw3 = rmsOf(w3);
    setText('gl-pos-hrms', C.fmt(ru, 2) + ' m');
    setText('gl-pos-3rms', '含高程分量 ' + C.fmt(ru3, 2) + ' m · 用 ' + st.sats.length + ' / 可见 ' + (st.pool || st.sats.length) + ' 颗');
    setText('gl-pos-hrms-w', isFinite(rw) ? C.fmt(rw, 2) + ' m' : '—');
    setText('gl-pos-hrms-w-ctx', isFinite(rw) && isFinite(ru) ? ((1 - rw / ru) >= 0 ? '同批数据改善 ' + C.fmt((1 - rw / ru) * 100, 1) + '%' : '反而变差 ' + C.fmt((rw / ru - 1) * 100, 1) + '%') + ' · 三维 ' + C.fmt(rw3, 2) + ' m' : '按 uereSigma 降权');
    setText('gl-pos-gdop', C.fmt(st.pdop, 2) + ' → ' + C.fmt(st.pdopW, 2));
    setText('gl-pos-gdop-ctx', '噪声最大/最小 ' + C.fmt(st.ratio, 1) + '× · 迭代 ' + C.fmt(st.iters, 1) + ' 次');
    setText('gl-pos-detail', '站点 ' + C.fmt(S0.lat, 1) + '°/' + C.fmt(S0.lon, 1) + '° · ' + st.sats.length + ' 颗卫星：伪距噪声按仰角放大（最低仰角是最高的 ' +
      C.fmt(st.ratio, 1) + '×），两种估计量吃同一批数据——等权水平 RMS ' + C.fmt(ru, 2) + ' m，高程加权 ' + C.fmt(rw, 2) + ' m（' +
      (isFinite(rw) && isFinite(ru) ? ((1 - rw / ru) >= 0 ? '改善 ' + C.fmt((1 - rw / ru) * 100, 1) + '%' : '反而变差 ' + C.fmt((rw / ru - 1) * 100, 1) + '%（模型有系统偏差时加权会放大它，这正是 ISB 必须估计的原因）') : '—') + (st.ionoRes ? '；电离层三情景（活跃度 ×' + st.ionoRes.act + '，同批噪声）：不改正 ' + C.fmt(st.ionoRes.none, 2) + ' m ／ 模型改正 ' + C.fmt(st.ionoRes.model, 2) + ' m ／ 双频消电离层 ' + C.fmt(st.ionoRes.dual, 2) + ' m（组合噪声放大 ' + C.fmt(st.ionoRes.amp, 2) + '×，L1 最大斜距延迟 ' + C.fmt(st.ionoRes.ioMax, 1) + ' m）' : '') +(st.usedIsb && isFinite(st.naiveHrms) ? '；不估 ISB 水平 RMS ' + C.fmt(st.naiveHrms, 2) + ' m → 估了 ISB 后 ' + C.fmt(ru, 2) + ' m（改善 ' + C.fmt((1 - ru / Math.max(1e-9, st.naiveHrms)) * 100, 1) + '%）' : '') + '。空心 = 等权解，实心 = 加权解（原点为真实位置）。');
  }
  APP.panels.pos = { state: st, run: run, updateStats: updateStats, enu: enu, relSigma: relSigma,
    init: function () {
      var a = el('gl-pos-sigma'), b = el('gl-pos-n');
      a.value = st.sigma; b.value = st.n;
      setText('gl-pos-sigma-val', C.fmt(st.sigma, 1) + ' m'); setText('gl-pos-n-val', st.n + '');
      a.addEventListener('input', function () { st.sigma = parseFloat(a.value); setText('gl-pos-sigma-val', C.fmt(st.sigma, 1) + ' m'); run(); });
      b.addEventListener('input', function () { st.n = parseInt(b.value, 10); setText('gl-pos-n-val', st.n + ''); run(); });
      el('gl-pos-run').addEventListener('click', run);
      var ia = el('gl-pos-iono-act');
      if (ia) {
        ia.value = String(st.ionoAct);
        ia.addEventListener('change', function () { st.ionoAct = parseFloat(ia.value); run(); });
      }
      var isbBox = el('gl-pos-isb');
      if (isbBox) {
        st.useIsb = isbBox.checked;
        isbBox.addEventListener('change', function () { st.useIsb = isbBox.checked; run(); });
      }
    } };
})();
