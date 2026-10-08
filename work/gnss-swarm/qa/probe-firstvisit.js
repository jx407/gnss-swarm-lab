'use strict';
/* probe-firstvisit: how long does the FIRST visit to a heavy panel take, and is the UI responsive during it? */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  console.log('load event at +' + (Date.now() - t0) + ' ms');
  await p.waitForTimeout(1200);
  for (const tab of ['cold', 'pll', 'pos', 'acq']) {
    const t = Date.now();
    await p.click('#gl-tab-' + tab);
    let done = null, maxLat = 0, samples = [];
    for (let i = 0; i < 200; i++) {
      const s0 = Date.now();
      const st = await p.evaluate((tb) => {
        const A = globalThis.GLAPP, id = 'gl-panel-' + tb;
        const panel = document.getElementById(id);
        const running = !!(A.panels[tb] && A.panels[tb].state && A.panels[tb].state.running);
        const prog = panel ? (panel.querySelector('.progress-bar') || {}).style ? panel.querySelector('.progress-bar').style.width : null : null;
        const phase = A.panels[tb] && A.panels[tb].state ? A.panels[tb].state.phase : null;
        return { running, prog, phase };
      }, tab);
      maxLat = Math.max(maxLat, Date.now() - s0);
      samples.push(st.running ? 1 : 0);
      if (!st.running && i > 3) { done = Date.now() - t; break; }
      await p.waitForTimeout(120);
    }
    console.log('tab=' + tab + ' first-visit settle=' + done + ' ms  maxEvalLatency=' + maxLat + ' ms  runningSamples=' + samples.join(''));
  }
  await b.close();
})();
