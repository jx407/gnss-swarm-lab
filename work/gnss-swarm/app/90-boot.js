/* 启动：标签页、尺寸变化、主题变化、状态保存 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP, G = globalThis.GNSS;
  function el(id) { return document.getElementById(id); }
  var TABS = [['gl-tab-sky', 'gl-panel-sky', 'sky'], ['gl-tab-ca', 'gl-panel-ca', 'ca'], ['gl-tab-acq', 'gl-panel-acq', 'acq'], ['gl-tab-pos', 'gl-panel-pos', 'pos'], ['gl-tab-mp', 'gl-panel-mp', 'mp'], ['gl-tab-raim', 'gl-panel-raim', 'raim'], ['gl-tab-geo', 'gl-panel-geo', 'geo'], ['gl-tab-atm', 'gl-panel-atm', 'atm'], ['gl-tab-cold', 'gl-panel-cold', 'cold'], ['gl-tab-pll', 'gl-panel-pll', 'pll']];
  var drawn = {}, stale = {}, resizePending = 0;

  function renderPanel(name) {
    try {
      if (name === 'sky') APP.panels.sky.render();
      else if (name === 'ca') APP.panels.ca.render();
      else if (name === 'acq') APP.panels.acq.draw();
      else if (name === 'pos') APP.panels.pos.draw();
      else if (name === 'mp' && APP.panels.mp) APP.panels.mp.render();
      else if (name === 'raim' && APP.panels.raim) APP.panels.raim.render();
      else if (name === 'geo' && APP.panels.geo) APP.panels.geo.render();
      else if (name === 'atm' && APP.panels.atm) APP.panels.atm.draw();
      else if (name === 'cold' && APP.panels.cold) { APP.panels.cold.draw(); if (APP.panels.dll) APP.panels.dll.draw(); }
      else if (name === 'pll' && APP.panels.pll) { APP.panels.pll.draw(); if (APP.panels.hatch) APP.panels.hatch.draw(); }
    } catch (e) {
      var p = el(TAB_PANEL(name));
      if (p) { var msg = p.querySelector('.gl-note'); if (msg) msg.textContent = '面板渲染出错：' + (e && e.message ? e.message : e); }
    }
  }
  function TAB_PANEL(name) { for (var i = 0; i < TABS.length; i++) if (TABS[i][2] === name) return TABS[i][1]; return ''; }
  function firstShow(name) {
    if (drawn[name]) return;
    drawn[name] = true;
    /* stale[name] = 几何/星座变了、这个面板当时不可见 → 现在必须按新几何重算 */
    if (name === 'acq' && (stale[name] || !APP.panels.acq.state.result)) APP.panels.acq.run();
    if (name === 'pos' && (stale[name] || !APP.panels.pos.state.trials.length)) APP.panels.pos.run();
    if (name === 'raim' && APP.panels.raim && (stale[name] || !APP.panels.raim.state.runs.length)) APP.panels.raim.run();
    if (name === 'atm' && APP.panels.atm && (stale[name] || !APP.panels.atm.state.geo)) APP.panels.atm.run();
    if (name === 'cold' && APP.panels.cold && (stale[name] || !APP.panels.cold.state.items.length)) APP.panels.cold.run();
    if (name === 'pll' && APP.panels.pll && (stale[name] || !APP.panels.pll.state.hasRun)) APP.panels.pll.run();
    if (name === 'pll' && APP.panels.hatch && (stale[name] || !APP.panels.hatch.state.hasRun)) APP.panels.hatch.run();
    stale[name] = false;
  }
  function activeName() {
    for (var i = 0; i < TABS.length; i++) { var p = el(TABS[i][1]); if (p && !p.hidden) return TABS[i][2]; }
    return 'sky';
  }
  function redrawVisible() {
    var n = activeName();
    firstShow(n);
    renderPanel(n);
  }
  function schedule() {
    requestAnimationFrame(function () { requestAnimationFrame(redrawVisible); });
  }
  function save() {
    if (!APP.state.save) return;
    try { APP.state.save(); } catch (e) { }
  }
  APP.state.save = function () {
    if (!(window.openai && window.openai.setWidgetState)) return;
    var st = APP.state;
    var payload = { modelContent: { tab: activeName(), lat: st.lat, lon: st.lon, mask: st.mask, hours: st.hours }, privateContent: { prn: APP.panels.ca.state.prn, prn2: APP.panels.ca.state.prn2 } };
    var pr = window.openai.setWidgetState(payload);
    if (pr && pr.catch) pr.catch(function () { });
  };

  function activate(idx) {
    for (var i = 0; i < TABS.length; i++) {
      var btn = el(TABS[i][0]), panel = el(TABS[i][1]), on = (i === idx);
      if (btn) {
        if (on) btn.classList.add('active'); else btn.classList.remove('active');
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.setAttribute('tabindex', on ? '0' : '-1');   /* roving tabindex（Mencius 审计 P2：10 个 tab 原来都在 Tab 序列里） */
      }
      if (panel) { if (on) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', ''); }
    }
  }
  APP.activateTab = activate;
  /* 接收机位置/历元/掩膜一改，定位、RAIM、多径三个面板都要跟着重算（防抖 350 ms，拖动时不至于卡） */
  var geoHookTimer = 0;
  APP.onGeometryChange = function () {
    if (geoHookTimer) clearTimeout(geoHookTimer);
    geoHookTimer = setTimeout(function () {
      geoHookTimer = 0;
      try {
        if (APP.panels.mp) APP.panels.mp.render();
        if (APP.panels.geo && !document.getElementById('gl-panel-geo').hidden) APP.panels.geo.render();
        if (APP.panels.atm && !document.getElementById('gl-panel-atm').hidden) APP.panels.atm.run();
        if (APP.panels.pos && !document.getElementById('gl-panel-pos').hidden) APP.panels.pos.run();
        if (APP.panels.raim && !document.getElementById('gl-panel-raim').hidden) APP.panels.raim.run();
        /* 当时不可见的面板标脏：切回来时要按新的几何重算，而不是继续显示旧结果（切换星座后曾经踩过） */
        var PANEL_IDS = { pos: 'gl-panel-pos', raim: 'gl-panel-raim', acq: 'gl-panel-acq', geo: 'gl-panel-geo', mp: 'gl-panel-mp', atm: 'gl-panel-atm', ca: 'gl-panel-ca', cold: 'gl-panel-cold' };
        Object.keys(PANEL_IDS).forEach(function (name) {
          var el2 = document.getElementById(PANEL_IDS[name]);
          if (el2 && el2.hidden) { drawn[name] = false; stale[name] = true; }
        });
      } catch (e) { }
    }, 350);
  };
  APP.panels.boot = { init: function () {
    for (var i = 0; i < TABS.length; i++) {
      (function (t, idx) {
        var btn = el(t[0]);
        if (btn) btn.addEventListener('click', function () { activate(idx); schedule(); save(); });
        /* 可访问性：ARIA tablist 的方向键导航（←/→/↑/↓/Home/End）——Aquinas 审计指出原来只有 Tab 键可达 */
        if (btn) btn.addEventListener('keydown', function (ev) {
          var k = ev.key, n = TABS.length, j = -1;
          if (k === 'ArrowRight' || k === 'ArrowDown') j = (idx + 1) % n;
          else if (k === 'ArrowLeft' || k === 'ArrowUp') j = (idx - 1 + n) % n;
          else if (k === 'Home') j = 0;
          else if (k === 'End') j = n - 1;
          if (j >= 0) {
            ev.preventDefault();
            var b2 = el(TABS[j][0]);
            if (b2) { activate(j); b2.focus(); schedule(); save(); }
          }
        });
      })(TABS[i], i);
    }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        if (resizePending) return;
        resizePending = requestAnimationFrame(function () { resizePending = 0; redrawVisible(); });
      });
      var cvs = document.querySelectorAll('#gnss-lab canvas');
      for (var k = 0; k < cvs.length; k++) ro.observe(cvs[k]);
    }
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq && mq.addEventListener) mq.addEventListener('change', function () { redrawVisible(); });
    } catch (e) { }
    window.addEventListener('openai:set_globals', function () {
      try {
        var ws = window.openai && window.openai.widgetState;
        if (ws && ws.modelContent && !APP.state.restored) {
          APP.state.restored = true;
          var m = ws.modelContent;
          if (m.lat != null) { APP.state.lat = m.lat; if (el('gl-lat')) { el('gl-lat').value = m.lat; el('gl-lat-val').textContent = Math.abs(m.lat).toFixed(1) + '°' + (m.lat >= 0 ? 'N' : 'S'); } }
          if (m.lon != null) { APP.state.lon = m.lon; if (el('gl-lon')) { el('gl-lon').value = m.lon; el('gl-lon-val').textContent = Math.abs(m.lon).toFixed(1) + '°' + (m.lon >= 0 ? 'E' : 'W'); } }
          if (m.mask != null) { APP.state.mask = m.mask; if (el('gl-mask')) { el('gl-mask').value = m.mask; el('gl-mask-val').textContent = m.mask + '°'; } }
          if (m.hours != null) APP.panels.sky.setHours(m.hours);
        }
      } catch (e2) { }
      redrawVisible();
    });
    APP.panels.ca.init();
    APP.panels.acq.init();
    APP.panels.pos.init();
    if (APP.panels.mp) APP.panels.mp.init();
    if (APP.panels.raim) APP.panels.raim.init();
    if (APP.panels.atm) APP.panels.atm.init();
    if (APP.panels.cold) APP.panels.cold.init();
    if (APP.panels.dll) APP.panels.dll.init();
    if (APP.panels.pll) APP.panels.pll.init();
    if (APP.panels.hatch) APP.panels.hatch.init();
    if (APP.panels.sky.initDoppler) APP.panels.sky.initDoppler();
    /* 无障碍：给滑杆补 aria-valuetext（Mencius 审计 P2：26/26 个 range 没有 valuetext）。
       值取自各自 label 内的动态值 span（如「仰角掩膜 <span>10°</span>」），随拖动同步。 */
    function syncRangeAria() {
      var rs = document.querySelectorAll('#gnss-lab input[type=range]');
      for (var i = 0; i < rs.length; i++) {
        var r = rs[i], lb = (r.labels && r.labels[0]) ? r.labels[0] : null;
        var sp = lb ? lb.querySelector('span') : null;
        var t = sp ? (sp.textContent || '').trim() : '';
        if (t) r.setAttribute('aria-valuetext', t);
      }
    }
    APP.syncRangeAria = syncRangeAria;
    syncRangeAria();
    /* v22：把每页的「这一页…」读法句提到面板顶部（ds4.1 代理 Feynman 实测：420×844 下 10/10 页的读法
       都落在首屏之外 —— 读者先看到一堆控件，却不知道这页在干什么）。只改 DOM 顺序，不改文本。 */
    (function () {
      var ps = document.querySelectorAll('#gnss-lab [role=tabpanel]');
      for (var i = 0; i < ps.length; i++) {
        var lead = ps[i].querySelector(':scope > p.gl-lead');
        var h2 = ps[i].querySelector(':scope > h2.gl-h2');
        if (lead && h2 && h2.nextElementSibling !== lead) h2.parentNode.insertBefore(lead, h2.nextSibling);
      }
    })();
    /* v22：窄屏渐进披露 —— 冷启动面板 ①②③ 参数组在 ≤620px 默认收起、宽屏默认展开
       （ds4.1 代理 Sagan 实测 420 px：2310 → 1879 px；代价是窄屏调参要先点一次组标题展开，
        组标题自带 ①②③ 与用途，④"算法与执行"始终展开、执行按钮不隐藏）。 */
    (function () {
      var gs = document.querySelectorAll('#gnss-lab details.gl-cold-group');
      if (!gs.length) return;
      var mq = window.matchMedia('(max-width: 620px)');
      function sync(ev) {
        var narrow = (ev && typeof ev.matches === 'boolean') ? ev.matches : mq.matches;
        for (var i = 0; i < gs.length; i++) gs[i].open = !narrow;
      }
      sync(null);
      if (mq.addEventListener) mq.addEventListener('change', sync);
      else if (mq.addListener) mq.addListener(sync);
    })();
    (function () {
      var lab = document.getElementById('gnss-lab');
      if (!lab) return;
      /* 冒泡阶段（在面板自己的监听之后）再同步，拿到的就是刚更新过的值 */
      lab.addEventListener('input', syncRangeAria);
      lab.addEventListener('change', syncRangeAria);
    })();
    try {
      var ws2 = window.openai && window.openai.widgetState;
      if (ws2 && ws2.modelContent && ws2.modelContent.lat != null) {
        APP.state.lat = ws2.modelContent.lat; el('gl-lat').value = APP.state.lat;
        APP.state.lon = ws2.modelContent.lon; el('gl-lon').value = APP.state.lon;
        APP.state.mask = ws2.modelContent.mask; el('gl-mask').value = APP.state.mask;
        APP.panels.sky.setHours(ws2.modelContent.hours || 0);
        APP.state.restored = true;
      }
      if (ws2 && ws2.privateContent) {
        if (ws2.privateContent.prn) { APP.panels.ca.state.prn = ws2.privateContent.prn; el('gl-prn').value = ws2.privateContent.prn; }
        if (ws2.privateContent.prn2) { APP.panels.ca.state.prn2 = ws2.privateContent.prn2; el('gl-prn2').value = ws2.privateContent.prn2; }
      }
    } catch (e3) { }
    drawn.sky = true;
    redrawVisible();
    setTimeout(function () { redrawVisible(); }, 80);
  } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { APP.panels.boot.init(); });
  else APP.panels.boot.init();
})();
