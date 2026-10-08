/* 面板六：RAIM 粗差检核（普通最小二乘 vs 剔除后重解） */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, S = APP.state, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  var st = { prn: 0, bias: 300, sigma: 5, runs: [], det: 0, last: null, busy: false, sats: [], rec: null };

  function enuOf(latDeg, lonDeg, d) {
    var la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
    return {
      e: -Math.sin(lo) * d.x + Math.cos(lo) * d.y,
      n: -Math.sin(la) * Math.cos(lo) * d.x - Math.sin(la) * Math.sin(lo) * d.y + Math.cos(la) * d.z,
      u: Math.cos(la) * Math.cos(lo) * d.x + Math.cos(la) * Math.sin(lo) * d.y + Math.sin(la) * d.z
    };
  }
  /* 从可见星里按 GDOP 贪心挑几何最好的一组：真实星座里"仰角最高的 N 颗"往往挤在一起，
   * 杠杆接近 1，粗差会被解直接吸收（RAIM 完全检不出来），必须先做子集选择。 */
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
    var chosen = pool.length > 20 ? pickBest(pool, 20, rec) : pool;
    return { rec: rec, sats: chosen.map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }; }) };
  }
  function refresh() {
    var geo = geometry();
    st.rec = geo.rec; st.sats = geo.sats;
    var sel = el('gl-raim-prn');
    var lev = leverage(geo.sats, geo.rec);
    st.lev = lev;
    if (sel) {
      var html = '', keep = false;
      for (var i = 0; i < geo.sats.length; i++) {
        var s = geo.sats[i];
        var lv = lev[i];
        html += '<option value="' + s.prn + '">PRN ' + s.prn + ' · 仰角 ' + Math.round(s.elDeg) + '° · 杠杆 ' + (isFinite(lv) ? lv.toFixed(3) : '—') + '</option>';
        if (s.prn === st.prn) keep = true;
      }
      sel.innerHTML = html;
      if (!keep && geo.sats.length) {
        /* 默认注入杠杆最低的那颗：杠杆高的卫星会把粗差吸收进解里，R A I M 很难检出来 */
        var bi = 0, bv = Infinity;
        for (var k = 0; k < lev.length; k++) if (isFinite(lev[k]) && lev[k] < bv) { bv = lev[k]; bi = k; }
        st.prn = geo.sats[bi] ? geo.sats[bi].prn : geo.sats[0].prn;
      }
      sel.value = String(st.prn);
    }
  }
  function invert4(M) {
    var A = [[M[0][0], M[0][1], M[0][2], M[0][3], 1, 0, 0, 0],
             [M[1][0], M[1][1], M[1][2], M[1][3], 0, 1, 0, 0],
             [M[2][0], M[2][1], M[2][2], M[2][3], 0, 0, 1, 0],
             [M[3][0], M[3][1], M[3][2], M[3][3], 0, 0, 0, 1]];
    for (var c = 0; c < 4; c++) {
      var piv = c;
      for (var r2 = c + 1; r2 < 4; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[piv][c])) piv = r2;
      if (!(Math.abs(A[piv][c]) > 1e-12)) return null;
      var tmp = A[c]; A[c] = A[piv]; A[piv] = tmp;
      var p = A[c][c];
      for (var k2 = 0; k2 < 8; k2++) A[c][k2] /= p;
      for (var r3 = 0; r3 < 4; r3++) {
        if (r3 === c) continue;
        var f = A[r3][c];
        if (!f) continue;
        for (var k3 = 0; k3 < 8; k3++) A[r3][k3] -= f * A[c][k3];
      }
    }
    return [[A[0][4], A[0][5], A[0][6], A[0][7]], [A[1][4], A[1][5], A[1][6], A[1][7]], [A[2][4], A[2][5], A[2][6], A[2][7]], [A[3][4], A[3][5], A[3][6], A[3][7]]];
  }
  function leverage(sats, rec) {
    var n = sats.length, i, a, b, rows = [];
    for (i = 0; i < n; i++) {
      var s = sats[i], dx = s.x - rec.x, dy = s.y - rec.y, dz = s.z - rec.z, r = Math.hypot(dx, dy, dz);
      rows.push([-dx / r, -dy / r, -dz / r, 1]);
    }
    var N = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (i = 0; i < n; i++) for (a = 0; a < 4; a++) for (b = 0; b < 4; b++) N[a][b] += rows[i][a] * rows[i][b];
    var inv = invert4(N);
    if (!inv) return sats.map(function () { return NaN; });
    var out = [];
    for (i = 0; i < n; i++) {
      var q = 0;
      for (a = 0; a < 4; a++) for (b = 0; b < 4; b++) q += rows[i][a] * inv[a][b] * rows[i][b];
      out.push(q);
    }
    return out;
  }
  function median(a) {
    var v = a.filter(isFinite).sort(function (x, y) { return x - y; });
    return v.length ? v[Math.floor(v.length / 2)] : NaN;
  }
  function run() {
    if (st.busy) return;
    if (!G.solveRaim) { setText('gl-raim-detail', 'RAIM 模块未加载。'); return; }
    var geo = geometry();
    if (geo.sats.length < 6) { setText('gl-raim-detail', '当前只有 ' + geo.sats.length + ' 颗可见卫星：RAIM 需要 ≥6 颗（2 个以上冗余）才能定位并排除粗差。'); return; }
    st.busy = true;
    setText('gl-raim-detail', '正在跑 20 次蒙特卡洛…');
    setTimeout(function () {
      var runs = [], det = 0, guess = { x: geo.rec.x + 800, y: geo.rec.y - 800, z: geo.rec.z + 800 };
      for (var k = 0; k < 20; k++) {
        var meas = G.simulatePseudoranges(geo.sats, geo.rec, { clockBiasM: 120, noiseSigmaM: st.sigma, seed: 5000 + k });
        var broken = meas.map(function (m) { return m.prn === st.prn ? { prn: m.prn, x: m.x, y: m.y, z: m.z, prM: m.prM + st.bias } : { prn: m.prn, x: m.x, y: m.y, z: m.z, prM: m.prM }; });
        var plain = G.solvePosition(broken, { guess: guess });
        var raim = G.solveRaim(broken, { guess: guess });
        var pE = plain.ok ? enuOf(S.lat, S.lon, { x: plain.x - geo.rec.x, y: plain.y - geo.rec.y, z: plain.z - geo.rec.z }) : null;
        var rE = raim && raim.ok ? enuOf(S.lat, S.lon, { x: raim.x - geo.rec.x, y: raim.y - geo.rec.y, z: raim.z - geo.rec.z }) : null;
        var hit = !!(raim.detected && raim.excluded && raim.excluded.length && raim.excluded[0].prn === st.prn);
        if (hit) det++;
        runs.push({ pE: pE, rE: rE, hit: hit, mode: raim.mode, stats: raim.statistics, sats: geo.sats, residuals: raim.residuals, rms: raim.rms, nl: hit && raim.excluded[0] && raim.excluded[0].normalizedResidual, idx: raim.excluded[0] ? raim.excluded[0].index : -1 });
      }
      st.runs = runs; st.det = det; st.last = runs[runs.length - 1]; st.busy = false;
      /* 保护限级：用当前几何与 sigma 的先验噪声算 HPL/VPL（与告警限 40 m 对照） */
      st.pl = null;
      if (G.protectionLevels) {
        try {
          var cleanMeas = G.simulatePseudoranges(geo.sats, geo.rec, { clockBiasM: 120, noiseSigmaM: st.sigma, seed: 5000 + 19 });
          st.pl = G.protectionLevels(cleanMeas, { sigma0: st.sigma });
        } catch (e) { st.pl = null; }
      }
      updateStats(); APP.panels.raim.draw();
    }, 0);
  }
  function updateStats() {
    var p = st.runs.map(function (r) { return r.pE ? Math.hypot(r.pE.e, r.pE.n) : NaN; });
    var q = st.runs.map(function (r) { return r.rE ? Math.hypot(r.rE.e, r.rE.n) : NaN; });
    var mp = median(p), mq = median(q);
    setText('gl-raim-det', st.det + '');
    setText('gl-raim-det-ctx', '/ ' + st.runs.length + ' 次 · 阈值 ' + C.fmt(st.last && st.last.stats ? st.last.stats.threshold : 5, 1));
    setText('gl-raim-plain', C.fmt(mp, 2) + ' m');
    setText('gl-raim-after', isFinite(mq) ? C.fmt(mq, 2) + ' m' : '—');
    setText('gl-raim-after-ctx', isFinite(mp) && isFinite(mq) ? '中位数 · 改善 ' + C.fmt(mp / Math.max(1e-9, mq), 1) + '×' : '中位数');
    var s = st.last && st.last.stats;
    setText('gl-raim-detail', s
      ? '站点 ' + C.fmt(S.lat, 1) + '°/' + C.fmt(S.lon, 1) + '° · PRN ' + st.prn + ' 注入 ' + st.bias + ' m 粗差（σ=' + C.fmt(st.sigma, 1) + ' m）：检出阶段 max|nmr| = ' + C.fmt(s.maxNormalizedResidual, 2) +
        '（阈值 ' + C.fmt(s.threshold, 1) + '）→ ' +
        '该星杠杆 ' + C.fmt(st.lev && st.lev[st.sats.map(function (s) { return s.prn; }).indexOf(st.prn)] , 3) + '（0–1，越接近 1 越难检出）· ' +
        (st.det > 0 ? '已判定并剔除该星后重解' : '低于阈值，本次无法判定') +
        '；剔除后残差 RMS = ' + C.fmt(st.last && st.last.rms, 2) + ' m。' +
        (st.pl && st.pl.ok ? '保护限级 HPL ' + C.fmt(st.pl.hpl, 1) + ' m / VPL ' + C.fmt(st.pl.vpl, 1) + ' m（水平告警限 40 m：' + (st.pl.hpl <= 40 ? '可用 ✓' : '超限 ✗ 几何不足') + '）。' : '')
      : '调粗差大小，看它多大才被检出来。');
  }
  APP.panels.raim = { state: st, run: run, refresh: refresh, updateStats: updateStats,
    render: function () { refresh(); if (APP.panels.raim.draw) APP.panels.raim.draw(); },
    init: function () {
      var sel = el('gl-raim-prn');
      sel.addEventListener('change', function () { st.prn = parseInt(sel.value, 10); run(); });
      var b = el('gl-raim-bias'), sg = el('gl-raim-sigma');
      b.value = st.bias; sg.value = st.sigma;
      setText('gl-raim-bias-val', st.bias + ' m'); setText('gl-raim-sigma-val', st.sigma.toFixed(1) + ' m');
      b.addEventListener('input', function () { st.bias = parseFloat(b.value); setText('gl-raim-bias-val', st.bias + ' m'); });
      sg.addEventListener('input', function () { st.sigma = parseFloat(sg.value); setText('gl-raim-sigma-val', st.sigma.toFixed(1) + ' m'); });
      el('gl-raim-run').addEventListener('click', run);
      refresh();
    } };
})();
