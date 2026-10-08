'use strict';
/* probe-gecko: true second-engine (Firefox/Gecko) verification of the standalone page */
process.env.PLAYWRIGHT_BROWSERS_PATH = 'D:/codex/2026-10-05/new-chat/.pw-browsers';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { firefox } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await firefox.launch();
  console.log('firefox version ' + b.version());
  for (const w of [420, 980]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const logs = [];
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    p.on('pageerror', e => logs.push('pageerror: ' + e.message));
    p.on('requestfailed', r => logs.push('requestfailed: ' + r.url()));
    const t0 = Date.now();
    await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
    const loadMs = Date.now() - t0;
    await p.waitForTimeout(2500);
    const info = await p.evaluate(() => {
      const lab = document.getElementById('gnss-lab');
      const tabs = lab.querySelectorAll('[role=tab]');
      const panels = lab.querySelectorAll('[role=tabpanel]');
      const cvs = lab.querySelectorAll('canvas');
      const sky = document.getElementById('gl-sky-canvas');
      let nonBlank = 0, cw = 0, ch = 0;
      if (sky) {
        cw = sky.width; ch = sky.height;
        try {
          const d = sky.getContext('2d').getImageData(0, 0, cw, ch).data;
          for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) nonBlank++;
        } catch (e) { nonBlank = -1; }
      }
      const ranges = Array.prototype.slice.call(lab.querySelectorAll('.viz-controls .gl-field')).filter(f => f.querySelector('input.form-range'));
      const tops = {}; ranges.forEach(f => { tops[Math.round(f.getBoundingClientRect().top)] = 1; });
      const sel = lab.querySelector('[role=tab][aria-selected=true]');
      const ph = document.getElementById('gl-cold-phase');
      return {
        tabs: tabs.length, panels: panels.length, canvases: cvs.length,
        tabindexActive: sel ? sel.getAttribute('tabindex') : null,
        pdop: (document.getElementById('gl-sky-pdop') || {}).textContent,
        coldPhase: !!ph, phaseLive: ph ? ph.getAttribute('aria-live') : null,
        hasSupport: CSS.supports('selector(:has(.x))'),
        rangeRows: Object.keys(tops).length, rangeCount: ranges.length,
        scrollMarginTop: getComputedStyle(document.getElementById('gl-lat') || document.body).scrollMarginTop,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        labScroll: lab.scrollWidth - lab.clientWidth,
        skyBitmap: cw + 'x' + ch, skyNonBlankPx: nonBlank
      };
    });
    console.log('W=' + w + ' loadMs=' + loadMs + ' ' + JSON.stringify(info) + ' issues=' + logs.length + (logs.length ? ' :: ' + logs.slice(0, 4).join(' | ') : ''));
    if (w === 980) {
      await p.click('#gl-tab-cold');
      let done = null; const t1 = Date.now();
      for (let i = 0; i < 400; i++) { if (!(await p.evaluate(() => GLAPP.panels.cold.state.running))) { done = Date.now() - t1; break; } await p.waitForTimeout(200); }
      await p.waitForTimeout(500);
      const cold = await p.evaluate(() => {
        const st = GLAPP.panels.cold.state;
        return { err: st.err, chipsRms: st.chipsRms, hatchRms: st.hatchRms, kfRms: st.kfRms, pllLocked: st.pllLocked, items: st.items.length,
                 phaseText: document.getElementById('gl-cold-phase').textContent };
      });
      console.log('FIREFOX cold settle=' + done + 'ms ' + JSON.stringify(cold));
      console.log('FIREFOX issues after cold=' + logs.length + (logs.length ? ' :: ' + logs.slice(0, 4).join(' | ') : ''));
    }
    await ctx.close();
  }
  await b.close();
})();
