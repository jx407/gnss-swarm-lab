'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const read = () => {
  const st = GLAPP.panels.cold.state;
  return { running: st.running, n: st.n, epochs: st.epochs, sats0: st.info ? st.info.sats0.length : null,
           progress: +(st.progress || 0).toFixed(3), items: st.items.length, phase: st.phase,
           nSlider: (document.getElementById('gl-cold-n') || {}).value,
           text: document.getElementById('gl-cold-phase').textContent.slice(0, 46) };
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e && e.message)));
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1500);
  console.log('before click: ' + JSON.stringify(await p.evaluate(read)));
  await p.click('#gl-tab-cold');
  for (const t of [300, 1000, 2000, 3500, 5000, 6500, 8000]) {
    await p.waitForTimeout(t === 300 ? 300 : 1000);
    console.log('t~' + t + ' ' + JSON.stringify(await p.evaluate(read)));
  }
  console.log('errors ' + JSON.stringify(errs));
  await b.close();
})();
