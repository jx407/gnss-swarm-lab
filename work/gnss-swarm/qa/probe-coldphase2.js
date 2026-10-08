'use strict';
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
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1000);
  await p.click('#gl-tab-cold');
  for (const wait of [400, 1000, 2500, 4000, 6000, 8000]) {
    const s = await p.evaluate(() => {
      const st = GLAPP.panels.cold.state;
      return { running: st.running, phase: st.phase, prog: +(st.progress || 0).toFixed(2), items: st.items.length,
               ttff: st.ttff, text: (document.getElementById('gl-cold-phase') || {}).textContent };
    });
    console.log('t~' + wait + 'ms ' + JSON.stringify(s));
  }
  console.log('errors=' + JSON.stringify(errs));
  await b.close();
})();
