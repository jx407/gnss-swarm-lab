'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [420, 980]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
    const p = await ctx.newPage();
    await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html', { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(1200);
    await p.evaluate((y) => window.scrollTo(0, y), 300);
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const nav = document.querySelector('#gnss-lab > nav');
      const b2 = nav.getBoundingClientRect();
      return { scrollY: Math.round(window.scrollY), navTop: +b2.top.toFixed(2), navH: Math.round(b2.height), pos: getComputedStyle(nav).position };
    });
    console.log('sticky W=' + w + ' ' + JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
})();
