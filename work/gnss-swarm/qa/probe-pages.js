'use strict';
/* 线上 Pages 实跑验证：控制台 0 报错 + canvas 真的画出来了 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const URL = 'https://jx407.github.io/gnss-swarm-lab/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  p.on('requestfailed', r => logs.push('requestfailed: ' + r.url()));
  const t0 = Date.now();
  await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
  const loadMs = Date.now() - t0;
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const lab = document.getElementById('gnss-lab');
    const sky = document.getElementById('gl-sky-canvas');
    let nonBlank = -1, w = 0, h = 0;
    if (sky) { w = sky.width; h = sky.height; try { const d = sky.getContext('2d').getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; nonBlank = n; } catch (e) { } }
    return { tabs: document.querySelectorAll('[role=tab]').length, panels: document.querySelectorAll('[role=tabpanel]').length,
             canvases: document.querySelectorAll('#gnss-lab canvas').length, pdop: (document.getElementById('gl-sky-pdop') || {}).textContent,
             sky: w + 'x' + h, nonBlank: nonBlank, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  console.log('ONLINE ' + URL + ' loadMs=' + loadMs + ' ' + JSON.stringify(r) + ' issues=' + logs.length + (logs.length ? ' :: ' + logs.slice(0, 4).join(' | ') : ''));
  await b.close();
})();
