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
  const shot = async (label, css) => {
    const h = await p.evaluate((c) => {
      let st = document.getElementById('__exp');
      if (!st) { st = document.createElement('style'); st.id = '__exp'; document.head.appendChild(st); }
      st.textContent = c || '';
      const panel = document.getElementById('gl-panel-cold');
      const vc = panel.querySelector(':scope > .viz-controls');
      const gs = Array.prototype.slice.call(panel.querySelectorAll(':scope > .viz-controls > details.gl-cold-group'));
      return { controls: Math.round(vc.getBoundingClientRect().height),
               panel: Math.round(panel.getBoundingClientRect().height),
               groups: gs.map(g => Math.round(g.getBoundingClientRect().height)),
               sumH: gs.map(g => Math.round(g.querySelector('summary').getBoundingClientRect().height)) };
    }, css);
    console.log(label + ' ' + JSON.stringify(h));
  };
  await shot('baseline           ', '');
  await shot('summary padding/m=0', 'details.gl-cold-group > summary.gl-legend{padding:0;margin:0;display:block}');
  await shot('wrapper pad=0      ', 'details.gl-cold-group{padding:0}');
  await shot('both               ', 'details.gl-cold-group > summary.gl-legend{padding:0;margin:0;display:block} details.gl-cold-group{padding:0}');
  await b.close();
})();
