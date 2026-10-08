/* 面板一：控件与交互 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, C = APP.core, S = APP.state;
  function el(id) { return document.getElementById(id); }
  function setText(id, t) { var e = el(id); if (e) e.textContent = t; }

  function bind(id, key, valId, fmt) {
    var inp = el(id);
    if (!inp) return;
    inp.addEventListener('input', function () {
      S[key] = parseFloat(inp.value);
      if (valId) setText(valId, fmt(S[key]));
      APP.panels.sky.render();
      if (APP.onGeometryChange) APP.onGeometryChange();
      if (APP.state.save) APP.state.save();
    });
  }
  bind('gl-lat', 'lat', 'gl-lat-val', function (v) { return C.fmt(Math.abs(v), 1) + '°' + (v >= 0 ? 'N' : 'S'); });
  bind('gl-lon', 'lon', 'gl-lon-val', function (v) { return C.fmt(Math.abs(v), 1) + '°' + (v >= 0 ? 'E' : 'W'); });
  bind('gl-mask', 'mask', 'gl-mask-val', function (v) { return v + '°'; });
  bind('gl-hours', 'hours', 'gl-hours-val', function (v) { return C.fmt(v, 1) + ' h'; });
  S.lat = parseFloat(el('gl-lat').value);
  S.lon = parseFloat(el('gl-lon').value);
  S.mask = parseFloat(el('gl-mask').value);
  S.hours = parseFloat(el('gl-hours').value);

  /* 键盘可用：下拉选择卫星（等价于点星图），补齐画布点击的无障碍缺口 */
  var skySel = el('gl-sky-prn');
  function refreshSkySelect() {
    if (!skySel || !APP.satsAt) return;
    var list = APP.satsAt(S.hours * 3600).slice().sort(function (a, b) { return String(a.prn) < String(b.prn) ? -1 : 1; });
    var html = '', keep = String(S.selPrn || '');
    for (var i = 0; i < list.length; i++) {
      var label = String(list[i].prn);
      html += '<option value="' + label + '">' + (APP.sysName ? APP.sysName(APP.sysOf(label)) + ' ' + label : label) + '</option>';
    }
    skySel.innerHTML = html;
    if (keep && html.indexOf('value="' + keep + '"') >= 0) skySel.value = keep;
  }
  if (skySel) {
    refreshSkySelect();
    skySel.addEventListener('change', function () {
      S.selPrn = skySel.value;
      APP.panels.sky.render();
      if (APP.onGeometryChange) APP.onGeometryChange();
    });
  }
  APP.panels.sky.refreshSelect = refreshSkySelect;
  APP.panels.sky.syncSelect = function () {
    if (skySel && S.selPrn != null) skySel.value = String(S.selPrn);
  };
  var sysSel = el('gl-sys');
  if (sysSel) {
    var SYS_MAP = { G: ['G'], GE: ['G', 'E'], GEC: ['G', 'E', 'C'] };
    sysSel.value = (APP.state.systems || ['G']).join('') === 'GE' ? 'GE' : ((APP.state.systems || []).length === 3 ? 'GEC' : 'G');
    sysSel.addEventListener('change', function () {
      var list = SYS_MAP[sysSel.value] || ['G'];
      APP.setSystems(list, sysSel.options[sysSel.selectedIndex].textContent.trim());
      if (APP.panels.sky.refreshSelect) APP.panels.sky.refreshSelect();
      APP.panels.sky.render();
      if (APP.onGeometryChange) APP.onGeometryChange();
      if (APP.state.save) APP.state.save();
    });
  }
  /* 星座来源：合成 Walker ↔ 真实 GPS 根数（真实模式为 GPS 单系统，禁用系统叠加） */
  var srcSel = el('gl-const-src');
  function constNote() {
    if (S.constSource === 'real') {
      var G = globalThis.GNSS, t0 = G.realConst && G.realConst.T0;
      var iso = isFinite(t0) ? new Date(t0 * 1000).toISOString().replace('.000Z', 'Z') : '—';
      return '真实星座：32 颗在轨 GPS 的平均根数（CelesTrak gp.php?GROUP=gps-ops，抓取于 2026-10-05），' +
        '简化开普勒传播（无 SGP4、无 J2 长期项）。参考时刻 T0 = ' + iso + '；历元跨度 18.62 天，其中 28 颗距 T0 ≤ 2 天。' +
        '与「加 J2 长期项」的独立对照：新鲜 28 颗中位差 4.2 km、最大 22 km；最老 1 颗（PRN21，18.62 天）151 km。' +
        '所以这是「几何可信、公里级误差」的真实快照，不是精密星历；上面「历元 t0+」就是相对 T0 的时长。';
    }
    return '合成星座：解析圆轨道 Walker 24/6/2（GPS，每星 ≤4.5° 抖动）+ Galileo + BeiDou-3 MEO，' +
      '可叠加成三系统。适合观察几何结构与「系统数变多 → 可见星变多 → PDOP 变小」的因果链；' +
      '切换来源到「真实 GPS」可换成 2026-10-05 的真实在轨构型。';
  }
  function applySource(init) {
    S.constSource = srcSel ? srcSel.value : 'syn';
    var real = S.constSource === 'real';
    if (sysSel) { sysSel.disabled = real; if (sysSel.parentNode) sysSel.parentNode.style.opacity = real ? '0.5' : ''; }
    var note = el('gl-const-note');
    if (note) note.textContent = constNote();
    if (init) return;
    S.selPrn = null;
    if (APP.panels.sky.refreshSelect) APP.panels.sky.refreshSelect();
    APP.panels.sky.render();
    if (APP.onGeometryChange) APP.onGeometryChange();
    if (S.save) S.save();
  }
  if (srcSel) {
    srcSel.value = S.constSource || 'syn';
    srcSel.addEventListener('change', function () { applySource(false); });
    applySource(true);
  }

  var sky = el('gl-sky-canvas');
  if (sky) {
    sky.classList.add('cursor-interaction');
    sky.addEventListener('click', function (ev) {
      var r = sky.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var hit = APP.panels.sky.hit || [], best = null, bd = 16 * 16;
      for (var i = 0; i < hit.length; i++) {
        var d = (hit[i].x - mx) * (hit[i].x - mx) + (hit[i].y - my) * (hit[i].y - my);
        if (d < bd) { bd = d; best = hit[i]; }
      }
      S.selPrn = best && best.prn !== S.selPrn ? best.prn : null;
      if (APP.panels.sky.syncSelect) APP.panels.sky.syncSelect();
      APP.panels.sky.render();
    });
  }
  var dopc = el('gl-dop-canvas');
  if (dopc) {
    dopc.classList.add('cursor-interaction');
    dopc.addEventListener('click', function (ev) {
      var r = dopc.getBoundingClientRect(), w = r.width;
      var x0 = 42, bw = Math.max(40, w - 58);
      var hv = ((ev.clientX - r.left) - x0) / bw * 24;
      APP.panels.sky.setHours(Math.round(hv * 4) / 4);
      APP.panels.sky.render();
    });
  }
})();
