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
      return { controls: Math.round(vc.getBoundingClientRect().height), panel: Math.round(panel.getBoundingClientRect().height),
               groups: gs.map(g => Math.round(g.getBoundingClientRect().height)), sumH: gs.map(g => Math.round(g.querySelector('summary').getBoundingClientRect().height)) };
    }, css);
    console.log(label + ' ' + JSON.stringify(h));
  };
  await shot('baseline              ', '');
  await shot('wrapper pad 8/12/10→0 ', '#gnss-lab details.gl-cold-group{padding:0} #gnss-lab details.gl-cold-group>.gl-group{border:1px solid #d8dbe0;border-radius:10px;padding:8px 12px 10px}');
  await shot('+ hide summary (box on inner, title via ::before)', '#gnss-lab details.gl-cold-group{padding:0;border:0} #gnss-lab details.gl-cold-group>summary.gl-legend{display:none} #gnss-lab details.gl-cold-group>.gl-group{border:1px solid #d8dbe0;border-radius:10px;padding:8px 12px 10px} #gnss-lab details.gl-cold-group>.gl-group::before{content:attr(data-title);display:block;flex:0 0 100%;margin:0 0 2px;font-size:12px;font-weight:600;color:#5a5f6a}');
  await b.close();
})();
