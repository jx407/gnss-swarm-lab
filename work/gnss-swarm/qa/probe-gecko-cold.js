'use strict';
process.env.PLAYWRIGHT_BROWSERS_PATH = 'D:/codex/2026-10-05/new-chat/.pw-browsers';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { firefox } = req('playwright');
(async () => {
  const b = await firefox.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html', { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(800);
  const t0 = Date.now();
  await p.click('#gl-tab-cold');
  let started = null, done = null;
  for (let i = 0; i < 500; i++) {
    const r = await p.evaluate(() => GLAPP.panels.cold.state.running);
    if (r && started === null) started = Date.now() - t0;
    if (!r && started !== null) { done = Date.now() - t0; break; }
    await p.waitForTimeout(100);
  }
  await p.waitForTimeout(400);
  const cold = await p.evaluate(() => {
    const st = GLAPP.panels.cold.state;
    return { err: st.err, chipsRms: st.chipsRms, hatchRms: st.hatchRms, kfRms: st.kfRms, pllLocked: st.pllLocked, items: st.items.length,
             ttff: Math.round(st.ttff), phaseText: document.getElementById('gl-cold-phase').textContent };
  });
  console.log('FIREFOX cold: started=+' + started + 'ms settled=+' + done + 'ms');
  console.log(JSON.stringify(cold));
  console.log('issues=' + logs.length + (logs.length ? ' :: ' + logs.join(' | ') : ''));
  await b.close();
})();
