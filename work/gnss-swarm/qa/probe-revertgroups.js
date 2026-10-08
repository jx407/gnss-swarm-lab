'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 844 } });
  const p = await ctx.newPage();
  await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html', { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1200);
  await p.click('#gl-tab-cold');
  await p.waitForTimeout(1500);
  const before = await p.evaluate(() => Math.round(document.getElementById('gl-panel-cold').getBoundingClientRect().height));
  const after = await p.evaluate(() => {
    const panel = document.getElementById('gl-panel-cold');
    const gs = Array.prototype.slice.call(panel.querySelectorAll(':scope > .viz-controls > details.gl-cold-group'));
    gs.forEach(d => {
      const inner = d.querySelector(':scope > .gl-group');
      const sum = d.querySelector('summary');
      const pEl = document.createElement('p'); pEl.className = 'gl-legend'; pEl.textContent = sum.textContent;
      inner.insertBefore(pEl, inner.firstChild);
      d.parentNode.insertBefore(inner, d); d.remove();
    });
    return { panel: Math.round(panel.getBoundingClientRect().height),
             controls: Math.round(panel.querySelector(':scope > .viz-controls').getBoundingClientRect().height) };
  });
  const cur = await p.evaluate(() => ({ controls: Math.round(document.getElementById('gl-panel-cold').querySelector(':scope > .viz-controls').getBoundingClientRect().height) }));
  console.log('with <details> wrappers : panel=' + before + ' controls=' + cur.controls);
  console.log('reverted to old div(s)  : panel=' + after.panel + ' controls=' + after.controls);
  await b.close();
})();
