'use strict';
/* probe-coldlt: cold-run start/settle wall time + longtask profile + final numbers */
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
    try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) { }
  });
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(700);
  const t0 = Date.now();
  await p.click('#gl-tab-cold');
  let started = null, settled = null;
  for (let i = 0; i < 600; i++) {
    const r = await p.evaluate(() => GLAPP.panels.cold.state.running);
    if (r && started === null) started = Date.now() - t0;
    if (!r && started !== null) { settled = Date.now() - t0; break; }
    await p.waitForTimeout(100);
  }
  const info = await p.evaluate(() => {
    const st = GLAPP.panels.cold.state;
    const lt = window.__LT.slice().sort((a, b) => b - a);
    return { err: st.err, chipsRms: st.chipsRms, hatchRms: st.hatchRms, kfRms: st.kfRms, ttff: Math.round(st.ttff),
             detected: st.detected, items: st.items.length, pllLocked: st.pllLocked, prog: +(st.progress || 0).toFixed(2),
             phaseText: document.getElementById('gl-cold-phase').textContent,
             ltCount: lt.length, ltMax: lt[0] || 0, ltSum: lt.reduce((a, b) => a + b, 0), ltTop: lt.slice(0, 8) };
  });
  console.log('started at +' + started + ' ms, settled at +' + settled + ' ms (wall, incl. 100 ms poll granularity)');
  console.log(JSON.stringify(info));
  await b.close();
})();
