'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OLD = 'file:///D:/codex/2026-10-05/new-chat/review/ds41/w3d-density/base-current.html';
const NEW = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  for (const [label, url] of [['OLD(cc2aa235, 本轮前)', OLD], ['NEW(当前)', NEW]]) {
    const ctx = await b.newContext({ viewport: { width: 420, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(1500);
    await p.click('#gl-tab-cold');
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => {
      const panel = document.getElementById('gl-panel-cold');
      const q = (s) => { const e = panel.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; };
      const cv = (id) => { const c = document.getElementById(id); return c ? Math.round(c.getBoundingClientRect().height) : null; };
      return { panel: Math.round(panel.getBoundingClientRect().height), controls: q(':scope > .viz-controls'), stats: q(':scope > .gl-stats'),
               ttff: cv('gl-cold-ttff'), perSat: cv('gl-cold-canvas'), epoch: cv('gl-cold-epoch-canvas'), dll: cv('gl-dll-canvas'),
               leadTop: (panel.querySelector(':scope > p.gl-lead') ? 1 : 0) };
    });
    console.log(label + ' ' + JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
})();
