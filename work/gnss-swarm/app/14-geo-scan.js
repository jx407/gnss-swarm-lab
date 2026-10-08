/* 全球几何对比：同一历元下 16 个站点的 24 小时 DOP 扫描（纯函数，可在 Node 里直接复核）
 * 只依赖 GNSS.*，不碰 DOM，便于测试脚本独立复算。 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP = globalThis.GLAPP || {};

  var CITIES = [
    ['北京', 39.9, 116.4], ['上海', 31.2, 121.5], ['广州', 23.1, 113.3], ['哈尔滨', 45.8, 126.6],
    ['新加坡', 1.4, 103.8], ['迪拜', 25.2, 55.3], ['莫斯科', 55.8, 37.6], ['伦敦', 51.5, -0.1],
    ['纽约', 40.7, -74.0], ['洛杉矶', 34.1, -118.2], ['里约', -22.9, -43.2], ['开普敦', -33.9, 18.4],
    ['悉尼', -33.9, 151.2], ['奥克兰', -36.8, 174.8], ['雷克雅未克', 64.1, -21.9], ['麦克默多', -77.8, 166.7]
  ];

  function mean(a) { if (!a.length) return NaN; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function sorted(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  function median(a) { var s = sorted(a); return s.length ? s[Math.floor(s.length / 2)] : NaN; }
  function quantile(a, q) { var s = sorted(a); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : NaN; }

  /* mask: 仰角掩膜；stepH: 扫描步长（小时）；返回每个站点的中位/95 分位 DOP 与可见星数统计 */
  function scan(cities, mask, stepH, systems) {
    var G = globalThis.GNSS, out = [], step = stepH || 0.5;
    for (var i = 0; i < cities.length; i++) {
      var c = cities[i];
      var rec = G.ecefFromGeodetic(c[1], c[2], 50);
      var satsAt = (typeof systems === 'function') ? systems : function (t) { return G.allSats(t); };
      var pd = [], hd = [], vd = [], vs = [], maxRel = 0, maxP = 0, maxH = 0;
      for (var h = 0; h <= 24 + 1e-9; h += step) {
        var vis = G.visible(satsAt(h * 3600), rec, mask);
        vs.push(vis.length);
        var d = vis.length >= 4 ? G.dop(vis, rec) : null;
        if (d && d.ok) {
          pd.push(d.pdop); hd.push(d.hdop); vd.push(d.vdop);
          if (d.pdop > maxP) { maxP = d.pdop; maxH = h; }
          var rel = Math.abs(Math.hypot(d.hdop, d.vdop) - d.pdop) / Math.max(1e-12, d.pdop);
          if (rel > maxRel) maxRel = rel;
        }
      }
      out.push({
        name: c[0], lat: c[1], lon: c[2],
        pdopMedian: median(pd), pdopP95: quantile(pd, 0.95), hdopMedian: median(hd), vdopMedian: median(vd),
        visMedian: median(vs), visMin: vs.length ? Math.min.apply(null, vs) : NaN, samples: pd.length,
        pdopMax: maxP, pdopMaxHour: maxH, identityMaxRel: maxRel
      });
    }
    return out;
  }
  APP.GEO_CITIES = CITIES;
  APP.geoScan = scan;
})();

/* 面板七：全球几何对比（绘制 + 状态） */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }
  var st = { all: [], here: null, identityMaxRel: 0, ms: 0 };

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function render() {
    if (!APP.geoScan) return;
    var S = APP.state;
    var cities = APP.GEO_CITIES.concat([['当前站点', S.lat, S.lon]]);
    var t0 = now();
    var rows = APP.geoScan(cities, S.mask, 0.25, APP.satsAt);
    st.ms = Math.round(now() - t0);
    st.all = rows;
    st.here = rows[rows.length - 1];
    st.identityMaxRel = 0;
    for (var i = 0; i < rows.length; i++) st.identityMaxRel = Math.max(st.identityMaxRel, rows[i].identityMaxRel || 0);
    var sorted = rows.slice(0, -1).sort(function (a, b) { return a.pdopMedian - b.pdopMedian; });
    var best = sorted[0], worst = sorted[sorted.length - 1];
    setText('gl-geo-here', C.fmt(st.here.pdopMedian, 2));
    setText('gl-geo-here-ctx', C.fmt(S.lat, 1) + '° / ' + C.fmt(S.lon, 1) + '° · 95 分位 ' + C.fmt(st.here.pdopP95, 2) + ' · 最差历元 ' + C.fmt(st.here.pdopMax, 1) + '（t+' + C.fmt(st.here.pdopMaxHour, 2) + ' h）· 可见星中位 ' + C.fmt(st.here.visMedian, 0));
    setText('gl-geo-best', best.name);
    setText('gl-geo-best-ctx', '中位 PDOP ' + C.fmt(best.pdopMedian, 2) + '（纬度 ' + C.fmt(best.lat, 0) + '°）');
    setText('gl-geo-worst', worst.name);
    setText('gl-geo-worst-ctx', '中位 PDOP ' + C.fmt(worst.pdopMedian, 2) + '（纬度 ' + C.fmt(worst.lat, 0) + '°）');
    setText('gl-geo-detail', '16 个站点 × 97 个历元（每 15 min）扫描 ' + st.ms + ' ms：几何最好 ' + best.name + ' ' + C.fmt(best.pdopMedian, 2) +
      '、最差 ' + worst.name + ' ' + C.fmt(worst.pdopMedian, 2) + '（中位数：DOP 序列是双峰的，中位数对采样格点敏感，故用 15 min 步长并同时给出 95 分位与最差历元）；所有站点逐历元满足 HDOP²+VDOP²=PDOP²（最大相对误差 ' +
      st.identityMaxRel.toExponential(1) + '）。');
    draw();
  }

  function draw() {
    var th = C.theme();
    var cv = el('gl-geo-canvas');
    if (!cv) return;
    var rows = st.all.slice().sort(function (a, b) { return a.pdopMedian - b.pdopMedian; });
    var H = Math.max(220, rows.length * 22 + 58);
    var g = C.prep(cv, H), ctx = g.ctx, w = g.w;
    /* y 由 30 → 36：标题画在 box.y-24，原来落在 y=6、字顶被画布上边缘裁掉（极端档扫描实测） */
    var box = { x: 106, y: 36, w: Math.max(60, w - 158), h: H - 58 };
    C.frame(ctx, box, th);
    var xmax = 0;
    for (var i = 0; i < rows.length; i++) xmax = Math.max(xmax, rows[i].pdopP95 || 0, rows[i].pdopMedian || 0);
    xmax = C.niceMax(xmax * 1.06);
    function X(v) { return box.x + v / xmax * box.w; }
    for (var t = 0; t <= 4; t++) {
      var v = xmax * t / 4, x = X(v);
      if (t > 0) C.gridV(ctx, x, box.y, box.y + box.h, th);
      C.label(ctx, C.fmt(v, v < 10 ? 1 : 0), x, box.y + box.h + 13, th.mutedFg, 'center', 11);
    }
    C.labelFit(ctx, '24 h 中位 PDOP（细须＝95 分位）', box.x, box.y - 24, w - box.x - 4, th.fg, 'left', 11, 500);
    if (st.here && isFinite(st.here.pdopMedian)) C.label(ctx, '当前 ' + C.fmt(st.here.pdopMedian, 2), box.x, box.y - 12, th.s2, 'left', 11, 500);
    C.label(ctx, '可见星', box.x + box.w, box.y - 12, th.mutedFg, 'right', 11);
    var rowH = box.h / rows.length;
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k], y = box.y + k * rowH, bh = Math.max(5, rowH - 8);
      var isHere = (r === st.here);
      ctx.fillStyle = isHere ? C.withAlpha(th.s2, 0.95) : C.withAlpha(th.s1, 0.75);
      ctx.fillRect(box.x, y + 4, Math.max(1.5, X(r.pdopMedian) - box.x), bh);
      ctx.strokeStyle = isHere ? th.s2 : C.withAlpha(th.fg, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(r.pdopP95), y + 4); ctx.lineTo(X(r.pdopP95), y + 4 + bh); ctx.stroke();
      C.label(ctx, r.name + ' ' + C.fmt(r.lat, 0) + '°', box.x - 8, y + rowH / 2, isHere ? th.fg : th.mutedFg, 'right', 11, isHere ? 500 : 400);
      C.label(ctx, C.fmt(r.visMedian, 0), box.x + box.w + 8, y + rowH / 2, th.mutedFg, 'left', 11);
    }
    if (st.here) {
      var hx = X(st.here.pdopMedian);
      ctx.save(); ctx.setLineDash([4, 3]);
      ctx.strokeStyle = C.withAlpha(th.s2, 0.9); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx, box.y); ctx.lineTo(hx, box.y + box.h); ctx.stroke();
      ctx.restore();
    }
  }

  APP.panels = APP.panels || {};
  APP.panels.geo = { state: st, render: render, draw: draw };
})();
