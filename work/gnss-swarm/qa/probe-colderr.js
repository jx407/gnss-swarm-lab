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
  p.on('pageerror', e => errs.push((e && e.stack ? e.stack.split('\n').slice(0, 4).join(' ⟂ ') : String(e))));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(700);
  await p.click('#gl-tab-cold');
  for (let i = 0; i < 200; i++) { if (!(await p.evaluate(() => GLAPP.panels.cold.state.running))) break; await p.waitForTimeout(200); }
  await p.waitForTimeout(600);
  console.log('errors: ' + JSON.stringify(errs, null, 1));
  console.log('text: ' + await p.evaluate(() => document.getElementById('gl-cold-phase').textContent));
  console.log('detail: ' + (await p.evaluate(() => document.getElementById('gl-cold-detail').textContent)).slice(0, 90));
  await b.close();
})();
