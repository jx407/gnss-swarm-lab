'use strict';
/* probe-coldchunk: after per-satellite chunking of the cold-start tail:
   total time / longtask+TTI profile / does the middle-state status text actually paint / identical numbers? */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.addInitScript(() => {
    window.__LT = []; window.__seen = {};
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) { }
    addEventListener('DOMContentLoaded', () => {
      (function frame() {
        const el = document.getElementById('gl-cold-phase');
        if (el) { const t = el.textContent.slice(0, 30); window.__seen[t] = (window.__seen[t] || 0) + 1; }
        requestAnimationFrame(frame);
      })();
    });
  });
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(700);
  const t0 = Date.now();
  await p.click('#gl-tab-cold');
  let started = null, done = null;
  for (let i = 0; i < 800; i++) {
    const r = await p.evaluate(() => GLAPP.panels.cold.state.running);
    if (r && started === null) started = Date.now() - t0;
    if (!r && started !== null) { done = Date.now() - t0; break; }
    await p.waitForTimeout(50);
  }
  const out = await p.evaluate(() => {
    const st = GLAPP.panels.cold.state, lt = window.__LT.slice().sort((a, b) => b - a);
    const tbt = lt.reduce((a, d) => a + Math.max(0, d - 50), 0);
    return { err: st.err, chipsRms: st.chipsRms, hatchRms: st.hatchRms, kfRms: st.kfRms, ttff: Math.round(st.ttff),
             pllLocked: st.pllLocked, hatchMs: Math.round(st.hatchMs),
             ltCount: lt.length, ltMax: lt[0] || 0, tbt: tbt, ltTop: lt.slice(0, 6),
             seenTexts: Object.keys(window.__seen), finalText: document.getElementById('gl-cold-phase').textContent };
  });
  console.log('total(click->idle) = ' + (done - t0) + ' ms   (started ' + (started - t0) + ' ms after click)');
  console.log(JSON.stringify(out, null, 1));
  console.log('pageerrors/console: ' + JSON.stringify(errs));
  await b.close();
})();
