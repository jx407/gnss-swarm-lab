'use strict';
/* probe-hatch-claim: reads what the Hatch panel ACTUALLY displays (std + denoise factor) */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(3000);
  await p.click('#gl-tab-pll');
  await p.waitForTimeout(500);
  const out = {};
  for (const mode of ['0', '20', '100']) {
    await p.selectOption('#gl-hatch-window', mode);
    await p.click('#gl-hatch-run');
    await p.waitForTimeout(4000);
    out['window=' + mode] = await p.evaluate(() => ({
      std: document.getElementById('gl-hatch-std').textContent,
      ctx: document.getElementById('gl-hatch-std-ctx').textContent,
      last: document.getElementById('gl-hatch-last').textContent,
      detail: document.getElementById('gl-hatch-detail').textContent
    }));
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
