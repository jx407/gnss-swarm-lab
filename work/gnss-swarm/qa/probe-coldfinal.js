'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__LT = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) { } });
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(700);
  const t0 = Date.now();
  await p.click('#gl-tab-cold');
  let started = null, t100 = null, done = null, textAt100 = null, textEarly = null;
  for (let i = 0; i < 900; i++) {
    const s = await p.evaluate(() => ({ r: GLAPP.panels.cold.state.running, pr: GLAPP.panels.cold.state.progress, tx: document.getElementById('gl-cold-phase').textContent }));
    const t = Date.now() - t0;
    if (s.r && started === null) started = t;
    if (started !== null && textEarly === null && t - started > 400) textEarly = s.tx;
    if (s.pr >= 0.999 && t100 === null) { t100 = t; textAt100 = s.tx; }
    if (!s.r && started !== null) { done = t; break; }
    await p.waitForTimeout(50);
  }
  const info = await p.evaluate(() => {
    const st = GLAPP.panels.cold.state; const lt = window.__LT.slice().sort((a, b) => b - a);
    return { err: st.err, chipsRms: st.chipsRms, hatchRms: st.hatchRms, kfRms: st.kfRms, ttff: Math.round(st.ttff), detected: st.detected, pllLocked: st.pllLocked,
             ltCount: lt.length, ltMax: lt[0] || 0, ltSum: lt.reduce((a, b) => a + b, 0), textFinal: document.getElementById('gl-cold-phase').textContent };
  });
  console.log('started=+' + started + '  100%=+' + t100 + '  done=+' + done + '  => finish block ~' + (done - t100) + ' ms');
  console.log('status @+400ms  : ' + textEarly);
  console.log('status @100%    : ' + textAt100);
  console.log('status @done    : ' + info.textFinal);
  console.log('numbers: ' + JSON.stringify(info));
  await b.close();
})();
