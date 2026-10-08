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
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const panel = document.getElementById('gl-panel-cold');
      const out = [];
      Array.prototype.slice.call(panel.children).forEach((c) => {
        const cs = getComputedStyle(c);
        if (cs.display === 'none') return;
        out.push({ tag: c.tagName + (c.id ? '#' + c.id : '') + (c.className && typeof c.className === 'string' ? '.' + c.className.split(/\s+/).slice(0, 2).join('.') : ''),
                   h: Math.round(c.getBoundingClientRect().height), w: Math.round(c.getBoundingClientRect().width), mt: cs.marginTop, mb: cs.marginBottom });
      });
      /* 组内字段：给宽度与 top，判断是否同行 */
      const rows = [];
      panel.querySelectorAll(':scope > .viz-controls > .gl-cold-group').forEach((g, gi) => {
        const f = Array.prototype.slice.call(g.querySelectorAll('.gl-field'));
        rows.push({ gi, gh: Math.round(g.getBoundingClientRect().height),
                    fields: f.map(x => Math.round(x.getBoundingClientRect().width) + '@' + Math.round(x.getBoundingClientRect().top)) });
      });
      return { panelH: Math.round(panel.getBoundingClientRect().height), children: out, rows: rows };
    });
    console.log('=== W=' + w + ' panelH=' + r.panelH + ' ===');
    r.children.forEach(c => console.log('  ' + c.tag + '  h=' + c.h + ' w=' + c.w + ' m=' + c.mt + '/' + c.mb));
    r.rows.forEach(x => console.log('  group' + x.gi + ' h=' + x.gh + ' fields(w@top)=' + x.fields.join(' ')));
    await ctx.close();
  }
  await b.close();
})();
