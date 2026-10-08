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
/* ① 计算帽子矩阵对角元（杠杆）：杠杆越高，这颗星的粗差越容易被解自己吸收、越难检出 */
sub('app/60-raim.js', '  function median(a) {',
`  function invert4(M) {
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
  function median(a) {`);
/* ② 下拉标签带杠杆，默认注入"最容易检出"（杠杆最低）的那颗 */
sub('app/60-raim.js', `    var sel = el('gl-raim-prn');
    if (sel) {
      var html = '', keep = false;
      for (var i = 0; i < geo.sats.length; i++) {
        var s = geo.sats[i];
        html += '<option value="' + s.prn + '">PRN ' + s.prn + ' · 仰角 ' + Math.round(s.elDeg) + '°</option>';
        if (s.prn === st.prn) keep = true;
      }
      sel.innerHTML = html;
      if (!keep && geo.sats.length) st.prn = geo.sats[0].prn;
      sel.value = String(st.prn);
    }`,
`    var sel = el('gl-raim-prn');
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
    }`);
/* ③ 详情里给出被注入卫星的杠杆 */
sub('app/60-raim.js', `        (st.det > 0 ? '已判定并剔除该星后重解' : '低于阈值，本次无法判定') +`,
`        '该星杠杆 ' + C.fmt(st.lev && st.lev[st.sats.map(function (s) { return s.prn; }).indexOf(st.prn)] , 3) + '（0–1，越接近 1 越难检出）· ' +
        (st.det > 0 ? '已判定并剔除该星后重解' : '低于阈值，本次无法判定') +`);
/* ④ 误差预算面板：改正比例拖动时必须重算当前误差 */
sub('app/70-atm.js', `      co.addEventListener('input', function () { st.corr = parseFloat(co.value) / 100; setText('gl-atm-corr-val', Math.round(st.corr * 100) + '%'); updateStats(); if (APP.panels.atm.draw) APP.panels.atm.draw(); });`,
`      co.addEventListener('input', function () {
        st.corr = parseFloat(co.value) / 100;
        setText('gl-atm-corr-val', Math.round(st.corr * 100) + '%');
        if (st.geo) st.errNow = positionError(st.corr).h;
        updateStats();
        if (APP.panels.atm.draw) APP.panels.atm.draw();
      });`);
