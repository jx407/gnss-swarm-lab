/* 可视化核心：主题色解析、画布、绘图基元（Codex 手写） */
(function () {
  'use strict';
  var APP = globalThis.GLAPP = globalThis.GLAPP || {};
  APP.panels = {};
  APP.state = { lat: 31.2, lon: 121.5, mask: 10, hours: 0, selPrn: null };

  var probe = null;
  function probeEl() {
    if (!probe) {
      probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;';
      (document.body || document.documentElement).appendChild(probe);
    }
    return probe;
  }
  /* 取主题变量解析后的真实颜色（light-dark() 也会被解析成 rgb） */
  function color(name, fallback) {
    var p = probeEl();
    /* 用 var(name, 哨兵) 而不是裸 var(name)：变量**未定义**时，浏览器会把 var() 解析成继承/初始值
       （通常就是 rgb(0,0,0)），不会保留 "var(...)" 字面量 —— 只比较字面量的话 fallback 永远不生效。
       ds4.1 代理 Kuhn 的 host-b 实测：宿主不提供 --viz-series-* 时，整张星座图只剩 rgb(0,0,0) 一种颜色。 */
    p.style.color = 'var(' + name + ', rgb(1, 2, 3))';
    var v = getComputedStyle(p).color;
    if (!v || v === 'rgb(1, 2, 3)' || v === 'var(' + name + ')' || v.indexOf('var(') === 0) return fallback;
    return v;
  }
  function theme() {
    return {
      fg: color('--foreground', '#111111'),
      mutedFg: color('--muted-foreground', '#666666'),
      border: color('--border', '#dddddd'),
      muted: color('--muted', '#eeeeee'),
      card: color('--card', '#ffffff'),
      primary: color('--primary', '#2563eb'),
      accent: color('--accent', '#eef2ff'),
      s1: color('--viz-series-1', '#2563eb'),
      s2: color('--viz-series-2', '#e07b39'),
      s3: color('--viz-series-3', '#2f9e6b'),
      s4: color('--viz-series-4', '#a855f7')
    };
  }
  function parseRgb(s) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(s || '');
    if (!m) return null;
    return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  }
  function mix(a, b, t) {
    var A = parseRgb(a), B = parseRgb(b);
    if (!A || !B) return t < 0.5 ? a : b;
    var r = Math.round(A[0] + (B[0] - A[0]) * t), g = Math.round(A[1] + (B[1] - A[1]) * t), bl = Math.round(A[2] + (B[2] - A[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function withAlpha(c, a) {
    var p = parseRgb(c);
    if (!p) return c;
    return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')';
  }
  /* 画布：按容器宽度与设备像素比建立，返回 2D 上下文 */
  function prep(canvas, height) {
    var dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    var w = Math.round(canvas.clientWidth || (canvas.parentNode && canvas.parentNode.clientWidth) || 320);
    if (w < 40) w = 320;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    return { ctx: ctx, w: w, h: height };
  }
  function font(size, weight) { return (weight || 400) + ' ' + size + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif'; }
  /* 边缘感知刻度（Volta 图表审计 #4）：贴左/贴右的刻度改用 left/right 对齐，避免被画布裁掉 */
  function labelTick(ctx, str, x, x0, x1, y, col, size) {
    var a = 'center';
    if (x <= x0 + 3) a = 'left'; else if (x >= x1 - 3) a = 'right';
    label(ctx, str, x, y, col, a, size);
  }

  /* 自适应文字：先按给定字号画；放不下就逐级缩小（到 minSize），仍放不下就截断加省略号。
     背景：320/360 px 宽的窄屏上，很多图的标题/图例是**单行固定字号**，实测右端溢出最多 75 px
     （360 px 下 4 处、320 px 下 9 处，独立审计 + 我自己的 w3-charts-320/360 探针实测）。 */
  function labelFit(ctx, str, x, y, maxW, col, align, size, weight, minSize) {
    var s = size || 12, lo = minSize || 9, lim = (maxW > 8) ? maxW : 8;
    var t = String(str);
    ctx.font = font(s, weight || 400);
    while (s > lo && ctx.measureText(t).width > lim) { s -= 0.5; ctx.font = font(s, weight || 400); }
    if (ctx.measureText(t).width > lim) {
      while (t.length > 1 && ctx.measureText(t + '…').width > lim) t = t.slice(0, -1);
      t += '…';
    }
    label(ctx, t, x, y, col, align, s, weight);
  }
  function label(ctx, str, x, y, col, align, size, weight) {
    ctx.font = font(size || 12, weight || 400);
    ctx.fillStyle = col;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  function frame(ctx, box, th) {
    ctx.strokeStyle = mix(th.border, th.fg, 0.24); ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(box.x) + 0.5, Math.round(box.y) + 0.5, Math.round(box.w), Math.round(box.h));
  }
  /* 网格线统一更轻（图表美化：26 个画布里网格透明度原分散在 0.5/0.6/0.65/0.7/0.9/1.0） */
  function gridH(ctx, x0, x1, y, th) { hLine(ctx, x0, x1, y, withAlpha(th.border, 0.5), 1); }
  function gridV(ctx, x, y0, y1, th) { vLine(ctx, x, y0, y1, withAlpha(th.border, 0.5), 1); }
  /* 数值零轴：比网格略重、带主色调，便于一眼定位基准线 */
  function axis0H(ctx, x0, x1, y, th) { hLine(ctx, x0, x1, y, withAlpha(th.fg, 0.34), 1); }
  function axis0V(ctx, x, y0, y1, th) { vLine(ctx, x, y0, y1, withAlpha(th.fg, 0.34), 1); }
  function hLine(ctx, x0, x1, y, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5); ctx.stroke(); }
  function vLine(ctx, x, y0, y1, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x + 0.5, y0); ctx.lineTo(x + 0.5, y1); ctx.stroke(); }
  function fmt(v, d) {
    if (!isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a !== 0 && (a < 10)) return v.toFixed(d == null ? 2 : d);
    return v.toFixed(d == null ? 1 : d);
  }
  function fmtKm(m) { return (m / 1000).toFixed(1) + ' km'; }
  function pair(min, max, n) { var a = []; for (var i = 0; i <= n; i++) a.push(min + (max - min) * i / n); return a; }
  function niceMax(v) { if (!(v > 0)) return 1; var e = Math.pow(10, Math.floor(Math.log10(v))); var m = v / e; var s = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10; return s * e; }

  APP.core = { theme: theme, prep: prep, label: label, labelTick: labelTick, labelFit: labelFit, frame: frame, hLine: hLine, vLine: vLine, gridH: gridH, gridV: gridV, axis0H: axis0H, axis0V: axis0V, mix: mix, withAlpha: withAlpha, fmt: fmt, fmtKm: fmtKm, pair: pair, niceMax: niceMax, font: font };
})();
