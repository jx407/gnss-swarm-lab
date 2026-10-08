'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(700);
  const t0 = Date.now();
  await p.click('#gl-tab-cold');
  let tProg1 = null, tDone = null, started = null;
  const marks = [];
  for (let i = 0; i < 900; i++) {
    const s = await p.evaluate(() => ({ r: GLAPP.panels.cold.state.running, p: GLAPP.panels.cold.state.progress, ph: GLAPP.panels.cold.state.phase }));
    const t = Date.now() - t0;
    if (s.r && started === null) started = t;
    if (s.p >= 0.999 && tProg1 === null) tProg1 = t;
    if (!s.r && started !== null) { tDone = t; break; }
    if (i % 10 === 0) marks.push(t + ':' + (s.p || 0).toFixed(2) + (s.r ? 'R' : '-'));
    await p.waitForTimeout(50);
  }
  console.log('started=+' + started + 'ms  progress100=+' + tProg1 + 'ms  done=+' + tDone + 'ms');
  console.log('=> steps phase=' + (tProg1 - started) + 'ms ; finish()/post-processing=' + (tDone - tProg1) + 'ms');
  console.log('timeline ' + marks.join(' '));
  await b.close();
})();
