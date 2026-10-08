/* 面板五：城市多径与遮挡（镜面反射几何 → 伪距偏差 → 最小二乘位置误差） */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, S = APP.state, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  var st = { prn: 0, dist: 12, height: 60, refl: 0.5, azim: 90, sats: [], rec: null, basis: null, last: null };

  function basisAt(latDeg, lonDeg) {
    var la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
    return {
      e: { x: -Math.sin(lo), y: Math.cos(lo), z: 0 },
      n: { x: -Math.sin(la) * Math.cos(lo), y: -Math.sin(la) * Math.sin(lo), z: Math.cos(la) },
      u: { x: Math.cos(la) * Math.cos(lo), y: Math.cos(la) * Math.sin(lo), z: Math.sin(la) }
    };
  }
  function project(p, b) {
    return { e: p.x * b.e.x + p.y * b.e.y + p.z * b.e.z, n: p.x * b.n.x + p.y * b.n.y + p.z * b.n.z, u: p.x * b.u.x + p.y * b.u.y + p.z * b.u.z };
  }
  function refresh() {
    st.basis = basisAt(S.lat, S.lon);
    st.rec = G.ecefFromGeodetic(S.lat, S.lon, 50);
    st.sats = G.visible(APP.satsAt(S.hours * 3600), st.rec, S.mask);
    var sel = el('gl-mp-prn');
    if (sel) {
      var prev = st.prn, html = '';
      for (var i = 0; i < st.sats.length; i++) {
        var s = st.sats[i];
        html += '<option value="' + s.prn + '">PRN ' + s.prn + ' · 方位 ' + Math.round(s.azDeg) + '° · 仰角 ' + Math.round(s.elDeg) + '°</option>';
      }
      sel.innerHTML = html;
      var found = false;
      for (var k = 0; k < st.sats.length; k++) if (st.sats[k].prn === prev) found = true;
      if (!found && st.sats.length) st.prn = st.sats[0].prn;
      pickValid();
      sel.value = String(st.prn);
    }
  }
  /* 默认挑一颗真能产生有效镜面反射的卫星；若当前墙向下所有卫星都无解，就把墙自动转向，
   * 直到找到一个能出现多径的朝向（真实街道朝向本来也随场景变化）。 */
  function tryAzimuth(az) {
    var w = wallAt(st.dist, st.height, az);
    for (var i = 0; i < st.sats.length; i++) {
      var s = st.sats[i];
      var rp = G.reflectPoint(st.rec, { x: s.x, y: s.y, z: s.z }, w);
      if (rp && rp.valid) return { az: az, prn: s.prn };
    }
    for (var k = 0; k < st.sats.length; k++) {
      var s2 = st.sats[k];
      if (!G.rayBlocked(st.rec, { x: s2.x, y: s2.y, z: s2.z }, w)) continue;
    }
    return null;
  }
  function pickValid() {
    if (!G.reflectPoint || !st.sats.length) return;
    var hit = tryAzimuth(st.azim);
    if (hit) {
      var cur = satOf(st.prn);
      if (cur) {
        var rp0 = G.reflectPoint(st.rec, { x: cur.x, y: cur.y, z: cur.z }, wallAt(st.dist, st.height, st.azim));
        if (rp0 && rp0.valid) return;
      }
      st.prn = hit.prn;
      return;
    }
    for (var az = 0; az < 360; az += 15) {
      if (az === st.azim) continue;
      var r2 = tryAzimuth(az);
      if (r2) {
        st.azim = az;
        st.prn = r2.prn;
        var inp = el('gl-mp-azim');
        if (inp) inp.value = az;
        if (APP.panels.mp.setAzimLabel) APP.panels.mp.setAzimLabel(az);
        st.autoTurned = az;
        return;
      }
    }
  }
  /* 墙面方位 az（自北顺时针）：hdir = 指向墙的水平单位向量，along = 沿墙水平方向 */
  function wallBasis(azDeg) {
    var b = st.basis, a = (azDeg == null ? st.azim : azDeg) * Math.PI / 180;
    var sa = Math.sin(a), ca = Math.cos(a);
    var h = { x: sa * b.e.x + ca * b.n.x, y: sa * b.e.y + ca * b.n.y, z: sa * b.e.z + ca * b.n.z };
    var al = { x: ca * b.e.x - sa * b.n.x, y: ca * b.e.y - sa * b.n.y, z: ca * b.e.z - sa * b.n.z };
    return { h: h, along: al, u: b.u };
  }
  function wallAt(d, height, azDeg) {
    var wb = wallBasis(azDeg), rec = st.rec, h = wb.h;
    return {
      point: { x: rec.x + h.x * d, y: rec.y + h.y * d, z: rec.z + h.z * d },
      normal: { x: -h.x, y: -h.y, z: -h.z },
      along: wb.along,
      halfWidthM: 60, zMinM: -6, zMaxM: -6 + height
    };
  }
  function wall() { return wallAt(st.dist, st.height); }
  function satOf(prn) {
    for (var i = 0; i < st.sats.length; i++) if (st.sats[i].prn === prn) return st.sats[i];
    return null;
  }
  function compute() {
    var out = { ok: false };
    if (!G.reflectPoint || !st.sats.length) return out;
    var sat = satOf(st.prn);
    if (!sat) return out;
    var w = wall(), rec = st.rec, p = { x: sat.x, y: sat.y, z: sat.z };
    out.sat = sat; out.wall = w;
    out.blocked = G.rayBlocked ? G.rayBlocked(rec, p, w) : false;
    var rp = G.reflectPoint(rec, p, w);
    out.reflect = rp;
    if (rp && rp.valid) {
      var bias = G.multipathBias(rec, p, w, { reflectionCoef: st.refl });
      out.bias = bias;
      out.err = positionError(bias && bias.pseudorangeBiasM);
      out.ok = true;
    }
    return out;
  }
  function positionError(biasM) {
    if (!isFinite(biasM) || !G.solvePosition || !G.simulatePseudoranges) return NaN;
    var sats = st.sats.slice(0, 8).map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z }; });
    var meas = G.simulatePseudoranges(sats, st.rec, { clockBiasM: 0, noiseSigmaM: 0, seed: 1 });
    var biased = meas.map(function (m) { return m.prn === st.prn ? { prn: m.prn, x: m.x, y: m.y, z: m.z, prM: m.prM + biasM } : { prn: m.prn, x: m.x, y: m.y, z: m.z, prM: m.prM }; });
    var sol = G.solvePosition(biased, { guess: { x: st.rec.x, y: st.rec.y, z: st.rec.z } });
    if (!sol.ok) return NaN;
    var enu = project({ x: sol.x - st.rec.x, y: sol.y - st.rec.y, z: sol.z - st.rec.z }, st.basis);
    return Math.hypot(enu.e, enu.n);
  }
  APP.panels.mp = { state: st, refresh: refresh, compute: compute, positionError: positionError, project: project,
    render: function () { if (APP.panels.mp.draw) { refresh(); st.last = compute(); APP.panels.mp.draw(); } },
    init: function () {
      var sel = el('gl-mp-prn');
      sel.addEventListener('change', function () { st.prn = parseInt(sel.value, 10); APP.panels.mp.render(); });
      function bind(id, key, valId, fmt, after) {
        var inp = el(id);
        inp.value = st[key];
        setText(valId, fmt(st[key]));
        inp.addEventListener('input', function () { st[key] = parseFloat(inp.value); setText(valId, fmt(st[key])); if (after) after(); APP.panels.mp.render(); });
      }
      bind('gl-mp-azim', 'azim', 'gl-mp-azim-val', function (v) { return v + '°'; });
      APP.panels.mp.setAzimLabel = function (v) {
        var dir = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
        var idx = Math.round(((v % 360) + 360) % 360 / 45) % 8;
        setText('gl-mp-azim-val', v + '°' + dir[idx]);
      };
      APP.panels.mp.wallBasis = wallBasis; APP.panels.mp.wallAt = wallAt;
      bind('gl-mp-dist', 'dist', 'gl-mp-dist-val', function (v) { return v + ' m'; });
      bind('gl-mp-height', 'height', 'gl-mp-height-val', function (v) { return v + ' m'; });
      bind('gl-mp-refl', 'refl', 'gl-mp-refl-val', function (v) { return v.toFixed(2); });
    } };
})();
