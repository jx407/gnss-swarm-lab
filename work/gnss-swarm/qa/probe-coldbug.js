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
  p.on('pageerror', e => errs.push('pageerror: ' + (e && e.stack ? e.stack.split('\n').slice(0,3).join(' | ') : e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(600);
  console.log('panel? ' + await p.evaluate(() => typeof (globalThis.GLAPP && GLAPP.panels && GLAPP.panels.cold && GLAPP.panels.cold.run)));
  await p.click('#gl-tab-cold');
  await p.waitForTimeout(500);
  console.log('after tab click: ' + JSON.stringify(await p.evaluate(() => {
    const st = GLAPP.panels.cold.state; return { running: st.running, items: st.items.length, info: !!st.info, phase: st.phase };
  })));
  console.log('errs: ' + JSON.stringify(errs));
  await p.click('#gl-cold-run');
  await p.waitForTimeout(2500);
  console.log('after run click: ' + JSON.stringify(await p.evaluate(() => {
    const st = GLAPP.panels.cold.state; return { running: st.running, items: st.items.length, prog: +(st.progress||0).toFixed(2), phase: st.phase, text: document.getElementById('gl-cold-phase').textContent };
  })));
  console.log('errs2: ' + JSON.stringify(errs));
  await b.close();
})();
