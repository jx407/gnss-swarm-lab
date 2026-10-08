'use strict';
/* probe-coldphase: does the cold panel tell the user what it is computing (live region) + longtask profile */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__LT = [];
    try {
      new PerformanceObserver(l => { l.getEntries().forEach(e => window.__LT.push(Math.round(e.duration))); })
        .observe({ entryTypes: ['longtask'] });
    } catch (e) { }
  });
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1000);
  await p.click('#gl-tab-cold');
  const snap = async (label) => {
    const s = await p.evaluate(() => {
      const ph = document.getElementById('gl-cold-phase');
      return { text: ph ? ph.textContent : null, live: ph ? ph.getAttribute('aria-live') : null, role: ph ? ph.getAttribute('role') : null };
    });
    console.log(label + ' phase=' + JSON.stringify(s.text) + ' role=' + s.role + ' live=' + s.live);
  };
  await snap('t+300ms');
  await p.waitForTimeout(1500); await snap('t+1.8s');
  const t0 = Date.now();
  for (let i = 0; i < 120; i++) { if (!(await p.evaluate(() => GLAPP.panels.cold.state.running))) break; await p.waitForTimeout(200); }
  console.log('compute settled at +' + (Date.now() - t0) + ' ms after t+1.8s');
  await snap('after');
  const lt = await p.evaluate(() => window.__LT.slice().sort((a, b) => b - a).slice(0, 6));
  console.log('top longtasks (ms): ' + lt.join(', '));
  await b.close();
})();
