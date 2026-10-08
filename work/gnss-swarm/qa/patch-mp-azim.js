'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 70));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* --- shell：新增墙面方位控件 --- */
sub('shell.html', `      <div class="gl-field">
        <label class="form-label" for="gl-mp-dist">接收机到墙 <span class="tabular-nums" id="gl-mp-dist-val">12 m</span></label>`,
`      <div class="gl-field">
        <label class="form-label" for="gl-mp-azim">墙面方位 <span class="tabular-nums" id="gl-mp-azim-val">90°E</span></label>
        <input class="form-range" type="range" id="gl-mp-azim" min="0" max="350" step="10" value="90">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-mp-dist">接收机到墙 <span class="tabular-nums" id="gl-mp-dist-val">12 m</span></label>`);
/* --- 50-mp.js：按方位构造墙 + 自动转向 --- */
sub('app/50-mp.js', "var st = { prn: 0, dist: 12, height: 60, refl: 0.5",
  "var st = { prn: 0, dist: 12, height: 60, refl: 0.5, azim: 90");
sub('app/50-mp.js', `  function wall() {
    var b = st.basis, rec = st.rec, d = st.dist;
    return {
      point: { x: rec.x + b.e.x * d, y: rec.y + b.e.y * d, z: rec.z + b.e.z * d },
      normal: { x: -b.e.x, y: -b.e.y, z: -b.e.z },
      along: { x: b.n.x, y: b.n.y, z: b.n.z },
      halfWidthM: 60, zMinM: -6, zMaxM: -6 + st.height
    };
  }`,
`  /* 墙面方位 az（自北顺时针）：hdir = 指向墙的水平单位向量，along = 沿墙水平方向 */
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
  function wall() { return wallAt(st.dist, st.height); }`);
sub('app/50-mp.js', `  /* 默认挑一颗真能产生有效镜面反射的卫星，省得用户第一眼看到"无有效反射" */
  function pickValid() {
    if (!G.reflectPoint || !st.sats.length) return;
    var w = wall(), cur = satOf(st.prn);
    if (cur) {
      var rp0 = G.reflectPoint(st.rec, { x: cur.x, y: cur.y, z: cur.z }, w);
      if (rp0 && rp0.valid) return;
    }
    for (var i = 0; i < st.sats.length; i++) {
      var s = st.sats[i];
      var rp = G.reflectPoint(st.rec, { x: s.x, y: s.y, z: s.z }, w);
      if (rp && rp.valid) { st.prn = s.prn; return; }
    }
  }`,
`  /* 默认挑一颗真能产生有效镜面反射的卫星；若当前墙向下所有卫星都无解，就把墙自动转向，
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
  }`);
sub('app/50-mp.js', `      bind('gl-mp-dist', 'dist', 'gl-mp-dist-val', function (v) { return v + ' m'; });`,
`      bind('gl-mp-azim', 'azim', 'gl-mp-azim-val', function (v) { return v + '°'; });
      APP.panels.mp.setAzimLabel = function (v) {
        var dir = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
        var idx = Math.round(((v % 360) + 360) % 360 / 45) % 8;
        setText('gl-mp-azim-val', v + '°' + dir[idx]);
      };
      APP.panels.mp.wallBasis = wallBasis; APP.panels.mp.wallAt = wallAt;
      bind('gl-mp-dist', 'dist', 'gl-mp-dist-val', function (v) { return v + ' m'; });`);
