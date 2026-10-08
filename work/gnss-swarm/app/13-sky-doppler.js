/* 星座面板：选中卫星的 24 小时多普勒曲线 + 送入捕获面板 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, S = APP.state, G = globalThis.GNSS;
  var cache = { prn: -1, lat: 0, lon: 0, pts: null };
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }

  /* ECEF 下接收机静止，多普勒 f_D = -(f_L1/c)·(v_sat·û) */
  function findSat(prn, tSec) {
    var list = APP.satsAt ? APP.satsAt(tSec) : G.allSats(tSec);
    for (var i = 0; i < list.length; i++) if (String(list[i].prn) === String(prn)) return list[i];
    return null;
  }
  function series(prn) {
    if (cache.prn === prn && cache.lat === S.lat && cache.lon === S.lon && cache.pts) return cache.pts;
    var rec = G.ecefFromGeodetic(S.lat, S.lon, 50), pts = [];
    for (var k = 0; k <= 48; k++) {
      var h = k / 2, t = h * 3600;
      var s = findSat(prn, t);
      if (!s) { pts.push([h, NaN]); continue; }
      var look = G.lookAngles(rec, s);
      if (look.elDeg < 0) { pts.push([h, NaN]); continue; }
      var dx = s.x - rec.x, dy = s.y - rec.y, dz = s.z - rec.z, r = Math.hypot(dx, dy, dz);
      /* 速度用位置中心差分：多系统下 GNSS.satVelocity 只认 GPS 的数字 PRN */
      var DT = 0.05, sp = findSat(prn, t - DT), sn = findSat(prn, t + DT);
      var v = (sp && sn) ? { x: (sn.x - sp.x) / (2 * DT), y: (sn.y - sp.y) / (2 * DT), z: (sn.z - sp.z) / (2 * DT) } : { x: 0, y: 0, z: 0 };
      var rate = (v.x * dx + v.y * dy + v.z * dz) / r;
      pts.push([h, -rate * G.CONST.F_L1 / G.CONST.c]);
    }
    cache = { prn: prn, lat: S.lat, lon: S.lon, pts: pts };
    return pts;
  }
  function current() {
    if (!S.selPrn) return NaN;
    var p = series(S.selPrn)[Math.round(S.hours * 2)];
    return p && isFinite(p[1]) ? p[1] : NaN;
  }
  function draw(th) {
    var cv = el('gl-doppler-canvas');
    if (!cv) return;
    var g = C.prep(cv, 156), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 56, y: 26, w: Math.max(40, w - 72), h: Math.max(30, h - 52) };
    C.frame(ctx, box, th);
    C.label(ctx, '径向速度引起的多普勒 (Hz)', box.x, box.y - 12, th.fg, 'left', 11, 500);
    /* 与末端刻度 24 同位置会互压；下移又会撞画布底边 → 放到轴上方右侧（与标题同行） */
    C.label(ctx, 't (h)', box.x + box.w, box.y - 12, th.mutedFg, 'right', 11);
    if (!S.selPrn || !G.satVelocity) {
      C.labelFit(ctx, '点一颗实心卫星（PRN 圆点），看它 24 小时的多普勒曲线', box.x + box.w / 2, box.y + box.h / 2, 2 * Math.min(box.x + box.w / 2, w - (box.x + box.w / 2)), th.mutedFg, 'center', 12);
      return;
    }
    var pts = series(S.selPrn), vals = [];
    for (var i = 0; i < pts.length; i++) if (isFinite(pts[i][1])) vals.push(pts[i][1]);
    if (!vals.length) { C.label(ctx, 'PRN ' + S.selPrn + ' 24 小时内始终在地平线以下', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = Math.max(300, (hi - lo) * 0.12);
    lo -= pad; hi += pad;
    function X(hv) { return box.x + hv / 24 * box.w; }
    function Y(v) { return box.y + box.h - (v - lo) / (hi - lo) * box.h; }
    for (var t = 0; t <= 4; t++) {
      var vv = lo + (hi - lo) * t / 4;
      if (t > 0) C.gridH(ctx, box.x, box.x + box.w, Y(vv), th);
      C.label(ctx, Math.round(vv) + '', box.x - 6, Y(vv), th.mutedFg, 'right', 11);
    }
    if (lo < 0 && hi > 0) C.axis0H(ctx, box.x, box.x + box.w, Y(0), th);
    for (var hh = 0; hh <= 24; hh += 6) C.label(ctx, hh + '', X(hh), box.y + box.h + 13, th.mutedFg, 'center', 11);
    ctx.strokeStyle = th.s2; ctx.lineWidth = 1.8; ctx.beginPath();
    var pen = false;
    for (var k = 0; k < pts.length; k++) {
      if (!isFinite(pts[k][1])) { pen = false; continue; }
      var px = X(pts[k][0]), py = Y(pts[k][1]);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    var cur = current();
    if (isFinite(cur)) {
      C.vLine(ctx, X(S.hours), box.y, box.y + box.h, C.withAlpha(th.fg, 0.45), 1);
      ctx.fillStyle = th.s2;
      ctx.beginPath(); ctx.arc(X(S.hours), Y(cur), 3.5, 0, Math.PI * 2); ctx.fill();
      var right = X(S.hours) > box.x + box.w - 90;
      C.label(ctx, '此刻 ' + Math.round(cur) + ' Hz', X(S.hours) + (right ? -8 : 8), Y(cur) - 10, th.fg, right ? 'right' : 'left', 11, 500);
    }
  }
  APP.panels.sky.drawDoppler = draw;
  APP.panels.sky.currentDoppler = current;
  APP.panels.sky.dopplerSeries = series;
  APP.panels.sky.initDoppler = function () {
    var btn = el('gl-dop-to-acq');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (String(S.selPrn || '').charAt(0) !== 'G') {
        setText('gl-sky-detail', 'PRN ' + S.selPrn + ' 属于 ' + (APP.sysName ? APP.sysName(APP.sysOf(S.selPrn)) : '非 GPS') + '：捕获面板演示的是 GPS C/A 码，换一颗 GPS 卫星再送过去。');
        return;
      }
      var v = current();
      if (!isFinite(v) || !APP.panels.acq.setDoppler) { setText('gl-sky-detail', '先选一颗 GPS 卫星（G01…G24）。'); return; }
      APP.panels.acq.setDoppler(v);
      if (APP.activateTab) APP.activateTab(2);
    });
  };
})();
