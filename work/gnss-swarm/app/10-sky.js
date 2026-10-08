/* 面板一：星座几何与 DOP */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, S = APP.state, G = globalThis.GNSS;
  function rec() { return G.ecefFromGeodetic(S.lat, S.lon, 50); }
  function snapshot() {
    var r = rec(), t = S.hours * 3600;
    var all = G.visible(APP.satsAt(t), r, -90);
    var vis = all.filter(function (s) { return s.elDeg >= S.mask; });
    var dop = vis.length >= 4 ? G.dop(vis, r) : { ok: false };
    return { rec: r, t: t, all: all, vis: vis, dop: dop };
  }
  var cache = { key: '', series: null };
  function dopSeries() {
    var key = S.lat + '|' + S.lon + '|' + S.mask;
    if (cache.key === key) return cache.series;
    var r = rec(), h = [], pd = [], hd = [], vd = [], nv = [];
    for (var x = 0; x <= 24.001; x += 0.5) {
      var vis = G.visible(APP.satsAt(x * 3600), r, S.mask);
      var d = vis.length >= 4 ? G.dop(vis, r) : null;
      h.push(x); nv.push(vis.length);
      pd.push(d && d.ok ? d.pdop : NaN); hd.push(d && d.ok ? d.hdop : NaN); vd.push(d && d.ok ? d.vdop : NaN);
    }
    cache = { key: key, series: { h: h, pdop: pd, hdop: hd, vdop: vd, n: nv } };
    return cache.series;
  }
  function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }

  function drawSky(snap) {
    var th = C.theme();
    var g = C.prep(document.getElementById('gl-sky-canvas'), 300);
    var ctx = g.ctx, w = g.w, h = g.h;
    var cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 26;
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.border;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    for (var k = 0; k < 3; k++) {
      var el = 30 * (k + 1);
      ctx.strokeStyle = C.withAlpha(th.border, k === 2 ? 1 : 0.7);
      ctx.beginPath(); ctx.arc(cx, cy, R * (1 - el / 90), 0, Math.PI * 2); ctx.stroke();
      C.label(ctx, el + '°', cx, cy - R * (1 - el / 90) - 7, th.mutedFg, 'center', 11);
    }
    ctx.strokeStyle = th.border;
    for (var d = 0; d < 4; d++) {
      var a = d * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); ctx.lineTo(cx - Math.sin(a) * R, cy + Math.cos(a) * R); ctx.stroke();
    }
    var dirs = [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]];
    for (var i = 0; i < 4; i++) {
      var ang = dirs[i][1];
      C.label(ctx, dirs[i][0], cx + Math.sin(ang) * (R + 14), cy - Math.cos(ang) * (R + 14), th.mutedFg, 'center', 12);
    }
    /* 掩膜圈 */
    if (S.mask > 0 && S.mask < 90) {
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = C.withAlpha(th.primary, 0.55);
      ctx.beginPath(); ctx.arc(cx, cy, R * (1 - S.mask / 90), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    /* 第一遍：算位置、画星点（标签要等所有星点已知后才能避让） */
    var hit = [], pts = [];
    for (var s = 0; s < snap.all.length; s++) {
      var sat = snap.all[s], el2 = Math.max(0, Math.min(90, sat.elDeg));
      var rr = R * (1 - el2 / 90), aa = sat.azDeg * Math.PI / 180;
      var x = cx + Math.sin(aa) * rr, y = cy - Math.cos(aa) * rr;
      pts.push({ prn: sat.prn, x: x, y: y, okVis: sat.elDeg >= S.mask });
      hit.push({ prn: sat.prn, x: x, y: y });
    }
    for (var s2 = 0; s2 < pts.length; s2++) {
      var p0 = pts[s2];
      ctx.beginPath();
      if (p0.okVis) { ctx.fillStyle = th.s1; ctx.arc(p0.x, p0.y, 6, 0, Math.PI * 2); ctx.fill(); }
      else {
        ctx.strokeStyle = C.withAlpha(th.mutedFg, 0.5); ctx.lineWidth = 1;
        ctx.arc(p0.x, p0.y, 3.5, 0, Math.PI * 2); ctx.stroke();
      }
      if (String(S.selPrn) === String(p0.prn)) {
        ctx.strokeStyle = th.primary; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p0.x, p0.y, 11, 0, Math.PI * 2); ctx.stroke();
      }
    }
    /* 第二遍：PRN 标签避让（Nash 探针：420 px 下曾有 4 对标签互压）。
       候选位按"越靠上越优先"排序；用 文字框×文字框(×14) + 文字框×星点 的重叠面积打分，取最小者，
       并剔除越出画布的候选位。仰角圈刻度也当障碍，避免标签压到"30°/60°/90°"。 */
    function ovl(a, b) {
      var ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      return (ox > 0 && oy > 0) ? ox * oy : 0;
    }
    var placed = [];
    ctx.font = C.font(11);
    for (var k3 = 0; k3 < 3; k3++) {
      var el3 = 30 * (k3 + 1), ly3 = cy - R * (1 - el3 / 90) - 7, tw3 = ctx.measureText(el3 + '°').width;
      placed.push({ l: cx - tw3 / 2 - 1, r: cx + tw3 / 2 + 1, t: ly3 - 7, b: ly3 + 7 });
    }
    /* 方位字母 N/E/S/W 也是文字：420 px 下曾出现 "G07" 压住 "E" */
    ctx.font = C.font(12);
    for (var d4 = 0; d4 < dirs.length; d4++) {
      var ang4 = dirs[d4][1], dx4 = cx + Math.sin(ang4) * (R + 14), dy4 = cy - Math.cos(ang4) * (R + 14);
      var tw4 = ctx.measureText(dirs[d4][0]).width;
      placed.push({ l: dx4 - tw4 / 2 - 1, r: dx4 + tw4 / 2 + 1, t: dy4 - 8, b: dy4 + 8 });
    }
    var OFF = [[0, -13], [0, 14], [16, -9], [-16, -9], [17, 11], [-17, 11], [0, -25], [0, 26]];
    for (var s3 = 0; s3 < pts.length; s3++) {
      var q = pts[s3], str = '' + q.prn;
      ctx.font = C.font(11, q.okVis ? 500 : 400);
      var tw = ctx.measureText(str).width;
      var bestPen = Infinity, bestX = q.x, bestY = q.y - 13, bestBox = null;
      for (var c = 0; c < OFF.length; c++) {
        var lx = q.x + OFF[c][0], ly = q.y + OFF[c][1];
        var bb = { l: lx - tw / 2 - 1.5, r: lx + tw / 2 + 1.5, t: ly - 7, b: ly + 7 };
        if (bb.l < 1 || bb.r > w - 1 || bb.t < 1 || bb.b > h - 1) continue;
        var pen = c * 0.5;
        for (var p1 = 0; p1 < placed.length; p1++) pen += ovl(bb, placed[p1]) * 14;
        for (var p2 = 0; p2 < pts.length; p2++) {
          if (p2 === s3) continue;
          pen += ovl(bb, { l: pts[p2].x - 7, r: pts[p2].x + 7, t: pts[p2].y - 7, b: pts[p2].y + 7 });
        }
        if (pen < bestPen) { bestPen = pen; bestX = lx; bestY = ly; bestBox = bb; }
      }
      placed.push(bestBox || { l: bestX - tw / 2, r: bestX + tw / 2, t: bestY - 7, b: bestY + 7 });
      C.label(ctx, str, bestX, bestY, q.okVis ? th.fg : th.mutedFg, 'center', 11, q.okVis ? 500 : 400);
    }
    APP.panels.sky.hit = hit;
    return { cx: cx, cy: cy, R: R };
  }
  APP.panels.sky = { hit: [], snapshot: snapshot, dopSeries: dopSeries, drawSky: drawSky };
})();
