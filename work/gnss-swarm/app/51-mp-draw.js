/* 面板五绘制：多径侧视图（保角）与「伪距偏差 vs 墙距」曲线 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }

  function sideView(th, d) {
    var g = C.prep(el('gl-mp-canvas'), 320), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 46, y: 24, w: Math.max(40, w - 60), h: Math.max(40, h - 84) };
    C.frame(ctx, box, th);
    if (!d.ok) {
      C.label(ctx, d.blocked ? '这颗卫星被墙挡住（非直视）' : (d.reason || '没有可用反射（反射点落在墙外或不在反射侧）'), box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12);
      C.label(ctx, '弧线：接收机；竖条：墙；射线方向按真实角度', box.x + 4, box.y + box.h - 12, th.mutedFg, 'left', 11);
      return;
    }
    var b = APP.panels.mp.state.basis, rec = APP.panels.mp.state.rec, sats = APP.panels.mp.state.sats, prn = APP.panels.mp.state.prn;
    var rec2 = { x: 0, y: 0 };
    var wallLo = { x: APP.panels.mp.state.dist, y: -6 }, wallHi = { x: APP.panels.mp.state.dist, y: -6 + APP.panels.mp.state.height };
    var sat = null;
    for (var i = 0; i < sats.length; i++) if (sats[i].prn === prn) sat = sats[i];
    var rp = d.reflect, wb = APP.panels.mp.wallBasis();
    var dv = { x: rp.point.x - rec.x, y: rp.point.y - rec.y, z: rp.point.z - rec.z };
    var rp2 = { e: dv.x * wb.h.x + dv.y * wb.h.y + dv.z * wb.h.z, u: dv.x * wb.u.x + dv.y * wb.u.y + dv.z * wb.u.z };
    var dir = (function () {
      var ux = sat.x - rec.x, uy = sat.y - rec.y, uz = sat.z - rec.z, n = Math.hypot(ux, uy, uz);
      var e = (ux * wb.h.x + uy * wb.h.y + uz * wb.h.z) / n, up = (ux * wb.u.x + uy * wb.u.y + uz * wb.u.z) / n;
      var m = Math.hypot(e, up) || 1;
      return { e: e / m, up: up / m };
    })();
    var xmin = Math.min(-12, rp2.e - 6), xmax = Math.max(APP.panels.mp.state.dist + 22, rp2.e + 8);
    var ymin = -10, ymax = Math.max(APP.panels.mp.state.height + 12, rp2.u + 10, 34);
    var sc = Math.min(box.w / (xmax - xmin), box.h / (ymax - ymin));
    var ox = box.x + box.w / 2 - (xmin + xmax) / 2 * sc, oy = box.y + box.h - (0 - ymin) * sc;
    function X(v) { return ox + v * sc; }
    function Y(v) { return oy - v * sc; }
    C.axis0H(ctx, box.x, box.x + box.w, Y(0), th);
    C.label(ctx, '地面', box.x + 2, Y(0) - 10, th.mutedFg, 'left', 11);
    /* 墙 */
    ctx.fillStyle = C.withAlpha(th.mutedFg, 0.22);
    ctx.fillRect(X(APP.panels.mp.state.dist) - 4, Y(wallHi.y), 8, Y(wallLo.y) - Y(wallHi.y));
    ctx.strokeStyle = C.withAlpha(th.mutedFg, 0.75); ctx.lineWidth = 1;
    ctx.strokeRect(X(APP.panels.mp.state.dist) - 4, Y(wallHi.y), 8, Y(wallLo.y) - Y(wallHi.y));
    var wallTxt = '墙 ' + APP.panels.mp.state.height + ' m';
    var wallX = X(APP.panels.mp.state.dist) + 8;
    ctx.font = C.font(11);
    var wallFlip = wallX + ctx.measureText(wallTxt).width > w - 3;   /* 贴右墙时右移会越界 → 改右对齐放到左边 */
    C.label(ctx, wallTxt, wallFlip ? wallX - 16 : wallX, Y(wallHi.y) - 8, th.mutedFg, wallFlip ? 'right' : 'left', 11);
    /* 接收机 */
    ctx.fillStyle = th.fg;
    ctx.beginPath(); ctx.arc(X(0), Y(0), 4, 0, Math.PI * 2); ctx.fill();
    C.label(ctx, '接收机', X(0) + 7, Y(0) - 9, th.fg, 'left', 11);
    /* 直达射线（示意，长度截断） */
    var L = Math.min((xmax - xmin), (ymax - ymin)) * 0.62;
    ctx.strokeStyle = th.s1; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(dir.e * L), Y(dir.up * L)); ctx.stroke();
    /* 反射射线 */
    ctx.save(); ctx.setLineDash([5, 4]);
    ctx.strokeStyle = th.s2; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(rp2.e), Y(rp2.u)); ctx.stroke();
    var L2 = Math.min((xmax - xmin), (ymax - ymin)) * 0.45;
    ctx.beginPath(); ctx.moveTo(X(rp2.e), Y(rp2.u)); ctx.lineTo(X(rp2.e + dir.e * L2), Y(rp2.u + dir.up * L2)); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = th.s2;
    ctx.beginPath(); ctx.arc(X(rp2.e), Y(rp2.u), 4, 0, Math.PI * 2); ctx.fill();
    /* 说明改为右下角图例：既不压射线/反射点，也不会在窄屏出界（Volta 图表审计 #5） */
    C.label(ctx, '直达：方位 ' + Math.round(sat.azDeg) + '° / 仰角 ' + Math.round(sat.elDeg) + '°',
      box.x, box.y + box.h + 17, th.s1, 'left', 11, 500);
    C.label(ctx, '反射点：多出 ' + C.fmt(d.bias.pathExtraM, 2) + ' m · 入射/反射 ' + C.fmt(rp.incidenceDeg, 1) + '°',
      box.x, box.y + box.h + 31, th.s2, 'left', 11, 500);
    C.labelFit(ctx, '示意：射线角度按真值，卫星距离截断；1 格 ≈ ' + C.fmt((xmax - xmin) / 6, 0) + ' m', box.x + 2, box.y + 10, w - box.x - 6, th.mutedFg, 'left', 11);
  }

  function biasCurve(th, d) {
    var g = C.prep(el('gl-mp-curve'), 320), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 48, y: 26, w: Math.max(40, w - 62), h: Math.max(40, h - 84) };
    C.frame(ctx, box, th);
    C.label(ctx, '伪距偏差 (m) vs 接收机到墙距离', box.x, box.y - 12, th.fg, 'left', 11, 500);
    C.label(ctx, '墙距 (m)', box.x + box.w, box.y + box.h + 13, th.mutedFg, 'right', 11);
    if (!d.ok || !d.sat || !G.multipathBias) { C.label(ctx, '当前几何无有效反射', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var st = APP.panels.mp.state, b = st.basis, rec = st.rec, sat = d.sat, pts = [], maxV = 0;
    for (var dist = 2; dist <= 120; dist += 2) {
      var wall = APP.panels.mp.wallAt(dist, st.height);
      var rp = G.reflectPoint(rec, { x: sat.x, y: sat.y, z: sat.z }, wall);
      var v = NaN;
      if (rp && rp.valid) { var bb = G.multipathBias(rec, { x: sat.x, y: sat.y, z: sat.z }, wall, { reflectionCoef: st.refl }); if (bb && bb.valid) v = bb.pseudorangeBiasM; }
      pts.push([dist, v]);
      if (isFinite(v)) maxV = Math.max(maxV, v);
    }
    var ymax = C.niceMax(Math.max(0.5, maxV * 1.15));
    function X(dd) { return box.x + (dd - 2) / 118 * box.w; }
    function Y(v) { return box.y + box.h - v / ymax * box.h; }
    for (var t = 0; t <= 4; t++) {
      var vv = ymax * t / 4;
      if (t > 0) C.gridH(ctx, box.x, box.x + box.w, Y(vv), th);
      C.label(ctx, C.fmt(vv, vv < 10 ? 2 : 1), box.x - 6, Y(vv), th.mutedFg, 'right', 11);
    }
    for (var dd = 2; dd <= 120; dd += 30) C.label(ctx, dd + '', X(dd), box.y + box.h + 13, th.mutedFg, 'center', 11);
    ctx.strokeStyle = th.s2; ctx.lineWidth = 1.8; ctx.beginPath();
    var pen = false;
    for (var i = 0; i < pts.length; i++) {
      if (!isFinite(pts[i][1])) { pen = false; continue; }
      var px = X(pts[i][0]), py = Y(pts[i][1]);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    var curX = X(APP.panels.mp.state.dist);
    C.vLine(ctx, curX, box.y, box.y + box.h, C.withAlpha(th.fg, 0.4), 1);
    if (d.bias && isFinite(d.bias.pseudorangeBiasM)) {
      ctx.fillStyle = th.s2; ctx.beginPath(); ctx.arc(curX, Y(d.bias.pseudorangeBiasM), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    C.label(ctx, '断点＝反射点落到墙外或墙顶之上', box.x, box.y + box.h + 29, th.mutedFg, 'left', 11);
  }

  APP.panels.mp.draw = function () {
    var th = C.theme(), d = APP.panels.mp.state.last || { ok: false };
    sideView(th, d);
    biasCurve(th, d);
    if (!d.ok) {
      setText('gl-mp-extra', '—'); setText('gl-mp-bias', '—'); setText('gl-mp-err', '—');
      setText('gl-mp-detail', d.blocked ? '这颗卫星的直达信号被墙挡住（非直视），属于遮挡而非多径。换一颗墙反射侧的卫星试试。' : '当前几何没有有效镜面反射：反射点落在墙的范围之外，或卫星在墙的另一侧。');
      return;
    }
    setText('gl-mp-extra', C.fmt(d.bias.pathExtraM, 2) + ' m');
    setText('gl-mp-extra-ctx', '反射 ' + C.fmt(d.reflect.reflectedPathM, 1) + ' m − 直达 ' + C.fmt(d.reflect.directPathM, 1) + ' m');
    setText('gl-mp-bias', C.fmt(d.bias.pseudorangeBiasM, 3) + ' m');
    setText('gl-mp-bias-ctx', '延迟 ' + C.fmt(d.bias.extraDelayChips, 3) + ' chip · 反射系数 ' + APP.panels.mp.state.refl.toFixed(2));
    setText('gl-mp-err', isFinite(d.err) ? C.fmt(d.err, 2) + ' m' : '—');
    setText('gl-mp-err-ctx', '把这一颗的伪距偏差单独喂进最小二乘');
    setText('gl-mp-detail', '站点 ' + C.fmt(APP.state.lat, 1) + '°/' + C.fmt(APP.state.lon, 1) + '° · 墙面方位 ' + APP.panels.mp.state.azim + '° · PRN ' + d.sat.prn + ' 仰角 ' + C.fmt(d.sat.elDeg, 1) + '°：延迟 ' + C.fmt(d.bias.pseudorangeBiasM / 293.05, 4) + ' m 折算 ' + C.fmt(d.bias.extraDelayChips, 3) + ' chip，相关器把它折成 ' + C.fmt(d.bias.pseudorangeBiasM, 3) + ' m 的伪距偏差，最终把解算位置推偏 ' + (isFinite(d.err) ? C.fmt(d.err, 2) + ' m' : '—') + '（单颗偏差会被最小二乘摊到各个方向）。');
  };
})();
