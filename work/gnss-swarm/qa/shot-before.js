'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [420, 980, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html', { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(2000);
    await p.screenshot({ path: 'qa/before-kimi/sky-' + w + '.png' });
    await p.click('#gl-tab-pos'); await p.waitForTimeout(2500);
    await p.screenshot({ path: 'qa/before-kimi/pos-' + w + '.png' });
    await p.click('#gl-tab-cold'); await p.waitForTimeout(6000);
    await p.screenshot({ path: 'qa/before-kimi/cold-' + w + '.png' });
    console.log('shot ' + w + ' ok');
    await ctx.close();
  }
  await b.close();
})();
