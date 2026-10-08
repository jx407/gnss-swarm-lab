'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  for (const w of [420, 980]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 880 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: 'qa/v23-top-' + w + '.png' });
    await p.click('#gl-tab-cold'); await p.waitForTimeout(3000);
    await p.screenshot({ path: 'qa/v23-cold-' + w + '.png' });
    console.log('shot ' + w + ' ok');
    await ctx.close();
  }
  await b.close();
})();
