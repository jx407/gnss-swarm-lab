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
    await p.click('#gl-tab-cold');
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const panel = document.getElementById('gl-panel-cold');
      const gs = Array.prototype.slice.call(panel.querySelectorAll(':scope > .viz-controls > .gl-group'));
      const cv = (id) => { const c = document.getElementById(id); return { cw: c ? c.clientWidth : null, sh: c ? c.style.height : null }; };
      return {
        panelH: Math.round(panel.getBoundingClientRect().height),
        groups: gs.map((g, i) => {
          const f = Array.prototype.slice.call(g.querySelectorAll('.gl-field'));
          const rows = {}; f.forEach(x => { rows[Math.round(x.getBoundingClientRect().top)] = (rows[Math.round(x.getBoundingClientRect().top)] || 0) + 1; });
          return { i: i, open: g.open, display: getComputedStyle(g).display, h: Math.round(g.getBoundingClientRect().height),
                   fields: f.length, rows: Object.keys(rows).length, summaryDisplay: (g.querySelector('summary') ? getComputedStyle(g.querySelector('summary')).display : 'n/a') };
        }),
        canv: { ttff: cv('gl-cold-ttff'), epoch: cv('gl-cold-epoch-canvas'), dll: cv('gl-dll-canvas'), perSat: cv('gl-cold-canvas') }
      };
    });
    console.log('W=' + w + ' panelH=' + r.panelH);
    r.groups.forEach(g => console.log('  group' + g.i + ' open=' + g.open + ' display=' + g.display + ' summary=' + g.summaryDisplay + ' h=' + g.h + ' fields=' + g.fields + ' rows=' + g.rows));
    console.log('  canv ' + JSON.stringify(r.canv));
    await ctx.close();
  }
  await b.close();
})();
