'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 980, height: 900 } }); const p = await ctx.newPage();
  await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html', { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(800); await p.click('#gl-tab-cold');
  for (let i = 0; i < 200; i++) { if (!(await p.evaluate(() => GLAPP.panels.cold.state.running))) break; await p.waitForTimeout(200); }
  await p.waitForTimeout(400);
  console.log('phase : ' + await p.evaluate(() => document.getElementById('gl-cold-phase').textContent));
  console.log('阶梯  : ' + (await p.evaluate(() => document.getElementById('gl-cold-detail').textContent)).slice(-120));
  console.log('cards : err=' + await p.evaluate(() => document.getElementById('gl-cold-err').textContent));
  await b.close();
})();
