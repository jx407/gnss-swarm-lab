'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function edit(file, pairs) {
  let s = fs.readFileSync(root + file, 'utf8');
  for (const [find, rep] of pairs) {
    const i = s.indexOf(find);
    if (i < 0) throw new Error('missing in ' + file + ': ' + find.slice(0, 60));
    s = s.slice(0, i) + rep + s.slice(i + find.length);
  }
  fs.writeFileSync(root + file, s);
  console.log('patched ' + file);
}
const PICK = `  /* 从可见星里按 GDOP 贪心挑几何最好的一组：真实星座里"仰角最高的 N 颗"往往挤在一起，
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
`;
edit('app/40-pos.js', [
  ['  function geometry() {\n    var rec = G.ecefFromGeodetic(S0.lat, S0.lon, 50);\n    var vis = G.visible(G.allSats(S0.hours * 3600), rec, S0.mask);\n    var sats = vis.slice(0, st.n).map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }; });\n    return { rec: rec, sats: sats };\n  }',
   PICK + '  function geometry() {\n    var rec = G.ecefFromGeodetic(S0.lat, S0.lon, 50);\n    var pool = G.visible(G.allSats(S0.hours * 3600), rec, 0);\n    var chosen = pool.length > st.n ? pickBest(pool, st.n, rec) : pool;\n    var sats = chosen.map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }; });\n    return { rec: rec, sats: sats };\n  }']
]);
edit('app/60-raim.js', [
  ['  function geometry() {\n    var rec = G.ecefFromGeodetic(S.lat, S.lon, 50);\n    var vis = G.visible(G.allSats(S.hours * 3600), rec, S.mask);\n    return { rec: rec, sats: vis.slice(0, 8).map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }; }) };\n  }',
   PICK + '  function geometry() {\n    var rec = G.ecefFromGeodetic(S.lat, S.lon, 50);\n    var pool = G.visible(G.allSats(S.hours * 3600), rec, 0);\n    var chosen = pool.length > 8 ? pickBest(pool, 8, rec) : pool;\n    return { rec: rec, sats: chosen.map(function (s) { return { prn: s.prn, x: s.x, y: s.y, z: s.z, elDeg: s.elDeg }; }) };\n  }']
]);
edit('app/50-mp.js', [['var st = { prn: 0, dist: 12, height: 25, refl: 0.5', 'var st = { prn: 0, dist: 12, height: 60, refl: 0.5']]);
