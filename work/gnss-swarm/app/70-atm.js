/* 面板八：误差预算（大气延迟 → 伪距偏差 → 位置误差；含"共同项被钟差吸收"的实证） */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, S = APP.state, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  var st = { fMHz: 1575.42, rh: 0.5, corr: 0.7, activity: 1, sigma: 2, geo: null, delays: [], zen: null, curve: [], errRaw: NaN, errNow: NaN, ms: 0 };

  function basis(latDeg, lonDeg) {
    var la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
    return {
      e: { x: -Math.sin(lo), y: Math.cos(lo), z: 0 },
      n: { x: -Math.sin(la) * Math.cos(lo), y: -Math.sin(la) * Math.sin(lo), z: Math.cos(la) },
      u: { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) }
    };
  }
  function enuOf(latDeg, lonDeg, d) {
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
  function geometry() {
    var rec = G.ecefFromGeodetic(S.lat, S.lon, 50);
    var pool = G.visible(APP.satsAt(S.hours * 3600), rec, Math.max(5, S.mask - 5));
    var chosen = pool.length > 8 ? pickBest(pool, 8, rec) : pool;
    return { rec: rec, sats: chosen };
  }
  var ALPHA0 = [2.5e-8, 0, -1.2e-7, 0];   // 中等太阳活动量级（默认系数太弱，天顶只有 ~2 m）
  /* 电离层按"本地午后峰值"计算：t=0 常落在 Klobuchar 的常数分支，天顶只有 2.6 m；
     t=6h 在余弦分支内，天顶约 14 m——这才是代表性量级。 */
  function ionoTime() { return 6 * 3600; }
  function ionoOpts(scale) {
    var a = Math.max(1, scale == null ? st.activity : scale);
    return { fHz: 1575.42e6, alpha: [ALPHA0[0] * a, ALPHA0[1] * a, ALPHA0[2] * a, ALPHA0[3] * a] };
  }
  function opts() { return { fHz: st.fMHz * 1e6, relHumidity: st.rh, heightM: 50, alpha: ionoOpts().alpha }; }
  /* 三情景同噪声对照：① L1 不改正 ② L1 + 模型改正 corr ③ L1/L2 消电离层组合 */
  function threeWay() {
    var geo = st.geo, rec = geo.rec;
    var F1 = 1575.42e6, F2 = 1227.60e6, k = Math.pow(F1 / F2, 2);
    var w1 = k / (k - 1), w2 = -1 / (k - 1);
    var meas = G.simulatePseudoranges(geo.sats, rec, { clockBiasM: 0, noiseSigmaM: 0, seed: 1 });
    var rnd = G.mulberry32(4242);
    function gauss() { var u1 = 1 - rnd(), u2 = rnd(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
    var raw = [], modeled = [], dual = [];
    for (var i = 0; i < meas.length; i++) {
      var m = meas[i], sat = { x: m.x, y: m.y, z: m.z };
      var I1 = G.ionoDelay(rec, sat, ionoTime(), ionoOpts()).slantM;
      var n1 = gauss() * st.sigma, n2 = gauss() * st.sigma;
      var rho1 = m.prM + I1 + n1;
      var rho2 = m.prM + I1 * k + n2;
      raw.push({ prn: m.prn, x: m.x, y: m.y, z: m.z, prM: rho1 });
      modeled.push({ prn: m.prn, x: m.x, y: m.y, z: m.z, prM: m.prM + (1 - st.corr) * I1 + n1 });
      dual.push({ prn: m.prn, x: m.x, y: m.y, z: m.z, prM: w1 * rho1 + w2 * rho2 });
    }
    function hErr(list) {
      var sol = G.solvePosition(list, { guess: { x: rec.x, y: rec.y, z: rec.z } });
      if (!sol.ok) return NaN;
      var e = enuOf(S.lat, S.lon, { x: sol.x - rec.x, y: sol.y - rec.y, z: sol.z - rec.z });
      return Math.hypot(e.e, e.n);
    }
    st.errRaw3 = hErr(raw); st.errModel3 = hErr(modeled); st.errDual3 = hErr(dual);
    st.amp = Math.sqrt(w1 * w1 + w2 * w2);
  }
  function tSec() { return S.hours * 3600; }

  function positionError(fraction) {
    var geo = st.geo, rec = geo.rec;
    var meas = G.simulatePseudoranges(geo.sats, rec, { clockBiasM: 0, noiseSigmaM: 0, seed: 1 });
    var biased = meas.map(function (m, i) {
      var dl = st.delays[i] ? st.delays[i].totalM : 0;
      return { prn: m.prn, x: m.x, y: m.y, z: m.z, prM: m.prM + (1 - fraction) * dl };
    });
    var sol = G.solvePosition(biased, { guess: { x: rec.x, y: rec.y, z: rec.z } });
    if (!sol.ok) return { h: NaN, clock: NaN };
    var enu = enuOf(S.lat, S.lon, { x: sol.x - rec.x, y: sol.y - rec.y, z: sol.z - rec.z });
    return { h: Math.hypot(enu.e, enu.n), clock: sol.clockBias };
  }

  function run() {
    if (!G.atmosDelay || !G.solvePosition) { setText('gl-atm-detail', '大气模块未加载。'); return; }
    var t0 = performance.now();
    var geo = geometry();
    if (geo.sats.length < 4) { setText('gl-atm-detail', '当前仰角掩膜下可见卫星不足 4 颗。'); return; }
    st.geo = geo;
    var b = basis(S.lat, S.lon);
    var zenSat = { x: geo.rec.x + b.u.x * 2e7, y: geo.rec.y + b.u.y * 2e7, z: geo.rec.z + b.u.z * 2e7 };
    st.zen = G.atmosDelay(geo.rec, zenSat, ionoTime(), opts());
    st.delays = geo.sats.map(function (s) {
      var d = G.atmosDelay(geo.rec, { x: s.x, y: s.y, z: s.z }, ionoTime(), opts());
      return { prn: s.prn, elevDeg: d.elevDeg, ionoM: d.ionoM, tropoM: d.tropoM, totalM: d.totalM, valid: d.valid };
    });
    st.curve = [];
    for (var k = 0; k <= 10; k++) {
      var f = k / 10, e = positionError(f);
      st.curve.push({ f: f, h: e.h, clock: e.clock });
    }
    st.errRaw = st.curve[0].h;
    var now = positionError(st.corr);
    st.errNow = now.h;
    if (G.solvePosition) threeWay();
    st.clockAbsorbed = st.curve[0].clock;
    st.ms = performance.now() - t0;
    updateStats();
    if (APP.panels.atm.draw) APP.panels.atm.draw();
  }
  function updateStats() {
    var low = null;
    for (var i = 0; i < st.delays.length; i++) if (st.delays[i].valid && (!low || st.delays[i].elevDeg < low.elevDeg)) low = st.delays[i];
    var mean = 0;
    for (var j = 0; j < st.delays.length; j++) mean += st.delays[j].totalM;
    mean /= Math.max(1, st.delays.length);
    setText('gl-atm-zen', st.zen && st.zen.valid ? C.fmt(st.zen.totalM, 2) + ' m' : '—');
    setText('gl-atm-zen-ctx', st.zen && st.zen.valid ? ('电离层 ' + C.fmt(st.zen.ionoM, 2) + ' m + 对流层 ' + C.fmt(st.zen.tropoM, 2) + ' m · ' + st.fMHz.toFixed(2) + ' MHz') : '—');
    setText('gl-atm-low', low ? C.fmt(low.totalM, 2) + ' m' : '—');
    setText('gl-atm-low-ctx', low ? ('PRN ' + low.prn + ' · 仰角 ' + C.fmt(low.elevDeg, 1) + '° · 电离层 ' + C.fmt(low.ionoM, 1) + ' + 对流层 ' + C.fmt(low.tropoM, 1)) : '—');
    setText('gl-atm-err', C.fmt(st.errRaw, 2) + ' m');
    setText('gl-atm-err-ctx', '改正 ' + Math.round(st.corr * 100) + '% 后 ' + C.fmt(st.errNow, 2) + ' m');
    var cmp = (isFinite(st.errRaw3) && isFinite(st.errDual3))
      ? ('三情景同噪声对照（活跃度 ×' + C.fmt(st.activity, 0) + '、σ=' + C.fmt(st.sigma, 1) + ' m）：L1 不改正 ' + C.fmt(st.errRaw3, 2) + ' m ／ L1+模型改正 ' + C.fmt(st.errModel3, 2) + ' m ／ 双频消电离层 ' + C.fmt(st.errDual3, 2) + ' m（组合噪声放大 ' + C.fmt(st.amp, 2) + '×）。')
      : '';
    setText('gl-atm-detail', '（按本地午后电离层峰值时刻）站点 ' + C.fmt(S.lat, 1) + '°/' + C.fmt(S.lon, 1) + '° · 载波 ' + st.fMHz.toFixed(2) + ' MHz · 湿度 ' + Math.round(st.rh * 100) + '%：' +
      st.delays.length + ' 颗卫星的平均斜距延迟 ' + C.fmt(mean, 2) + ' m 里，共同部分被钟差吸收（钟差估计被抬高 ' + C.fmt(st.clockAbsorbed, 2) + ' m）——' +
      '所以完全不改正也只有 ' + C.fmt(st.errRaw, 2) + ' m 水平误差；改正 ' + Math.round(st.corr * 100) + '% 后降到 ' + C.fmt(st.errNow, 2) + ' m（计算耗时 ' + st.ms.toFixed(0) + ' ms）。' + cmp);
  }

  APP.panels.atm = { state: st, run: run, updateStats: updateStats, geometry: geometry, ionoAlpha: function () { return ionoOpts().alpha; }, alpha0: function () { return ALPHA0.slice(); },
    render: function () { run(); },
    init: function () {
      var f = el('gl-atm-freq'), rh = el('gl-atm-rh'), co = el('gl-atm-corr');
      f.value = st.fMHz.toFixed(2); rh.value = st.rh * 100; co.value = st.corr * 100;
      f.addEventListener('change', function () {
        st.fMHz = parseFloat(f.value);
        setText('gl-atm-freq-val', parseFloat(f.value) === 1575.42 ? 'L1' : 'L2');
        APP.panels.atm.render();
      });
      rh.addEventListener('input', function () { st.rh = parseFloat(rh.value) / 100; setText('gl-atm-rh-val', Math.round(st.rh * 100) + '%'); APP.panels.atm.render(); });
      var act = el('gl-atm-act'), sg = el('gl-atm-sig');
      if (act) { act.value = st.activity; setText('gl-atm-act-val', '×' + st.activity); act.addEventListener('input', function () { st.activity = parseFloat(act.value); setText('gl-atm-act-val', '×' + st.activity); APP.panels.atm.render(); }); }
      if (sg) { sg.value = st.sigma; setText('gl-atm-sig-val', C.fmt(st.sigma, 1) + ' m'); sg.addEventListener('input', function () { st.sigma = parseFloat(sg.value); setText('gl-atm-sig-val', C.fmt(st.sigma, 1) + ' m'); APP.panels.atm.render(); }); }
      var preset = el('gl-atm-preset');
      if (preset) preset.addEventListener('click', function () {
        st.activity = 20; st.sigma = 1;
        var a2 = el('gl-atm-act'), s2 = el('gl-atm-sig');
        if (a2) a2.value = 20; if (s2) s2.value = 1;
        setText('gl-atm-act-val', '×20'); setText('gl-atm-sig-val', '1.0 m');
        APP.panels.atm.render();
      });
      co.addEventListener('input', function () {
        st.corr = parseFloat(co.value) / 100;
        setText('gl-atm-corr-val', Math.round(st.corr * 100) + '%');
        if (st.geo) st.errNow = positionError(st.corr).h;
        updateStats();
        if (APP.panels.atm.draw) APP.panels.atm.draw();
      });
    } };
})();
