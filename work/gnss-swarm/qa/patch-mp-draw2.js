'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/app/51-mp-draw.js';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 70));
  s = s.split(find).join(rep);
}
/* 侧视图改成沿「墙面方位」的水平方向投影（原来是固定正东） */
sub("    var rp = d.reflect, rp2 = APP.panels.mp.project({ x: rp.point.x - rec.x, y: rp.point.y - rec.y, z: rp.point.z - rec.z }, b);",
  "    var wb = APP.panels.mp.wallBasis();\n    var dv = { x: rp.point.x - rec.x, y: rp.point.y - rec.y, z: rp.point.z - rec.z };\n    var rp2 = { e: dv.x * wb.h.x + dv.y * wb.h.y + dv.z * wb.h.z, u: dv.x * wb.u.x + dv.y * wb.u.y + dv.z * wb.u.z };");
sub("      var e = (ux * b.e.x + uy * b.e.y + uz * b.e.z) / n, up = (ux * b.u.x + uy * b.u.y + uz * b.u.z) / n;",
  "      var e = (ux * wb.h.x + uy * wb.h.y + uz * wb.h.z) / n, up = (ux * wb.u.x + uy * wb.u.y + uz * wb.u.z) / n;");
/* 偏差-墙距曲线同样按当前方位构造墙 */
sub(`      var wall = {
        point: { x: rec.x + b.e.x * dist, y: rec.y + b.e.y * dist, z: rec.z + b.e.z * dist },
        normal: { x: -b.e.x, y: -b.e.y, z: -b.e.z }, along: { x: b.n.x, y: b.n.y, z: b.n.z },
        halfWidthM: 60, zMinM: -6, zMaxM: -6 + st.height
      };`,
  "      var wall = APP.panels.mp.wallAt(dist, st.height);");
/* 详情里带上墙面方位，便于解释"为什么自动转向了" */
sub("    setText('gl-mp-detail', '站点 ' + C.fmt(APP.state.lat, 1) + '°/' + C.fmt(APP.state.lon, 1) + '° · PRN ' + d.sat.prn",
  "    setText('gl-mp-detail', '站点 ' + C.fmt(APP.state.lat, 1) + '°/' + C.fmt(APP.state.lon, 1) + '° · 墙面方位 ' + APP.panels.mp.state.azim + '° · PRN ' + d.sat.prn");
fs.writeFileSync(p, s);
console.log('mp draw patched');
