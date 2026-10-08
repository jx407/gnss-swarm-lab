'use strict';
/* probe-groups: narrow-screen progressive disclosure of cold panel groups ①②③ + reduced canvas heights */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [420, 980]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
    const p = await ctx.newPage();
    const logs = [];
    p.on('pageerror', e => logs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html', { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(1500);
    await p.click('#gl-tab-cold');
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => {
      const panel = document.getElementById('gl-panel-cold');
      const gs = Array.prototype.slice.call(panel.querySelectorAll(':scope > .viz-controls > details.gl-cold-group'));
      const cv = (id) => { const c = document.getElementById(id); return c ? Math.round(c.getBoundingClientRect().height) : null; };
      return { groups: gs.length, open: gs.map(g => g.open), summaries: gs.map(g => (g.querySelector('summary') || {}).textContent),
               coldH: Math.round(panel.getBoundingClientRect().height),
               cvTtff: cv('gl-cold-ttff'), cvEpoch: cv('gl-cold-epoch-canvas'), cvDll: cv('gl-dll-canvas'), cvPerSat: cv('gl-cold-canvas'),
               overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
               labScroll: document.getElementById('gnss-lab').scrollWidth - document.getElementById('gnss-lab').clientWidth };
    });
    console.log('W=' + w + ' ' + JSON.stringify(r));
    if (w === 420) {
      /* 展开 ①，改一个滑杆，确认折叠不影响可操作性 */
      const before = await p.evaluate(() => document.getElementById('gl-cold-n').value);
      await p.click('#gl-panel-cold > .viz-controls > details.gl-cold-group > summary');
      await p.waitForTimeout(300);
      const vis = await p.evaluate(() => { const f = document.querySelector('#gl-panel-cold details.gl-cold-group .gl-field'); return Math.round(f.getBoundingClientRect().height); });
      const after = await p.evaluate(() => {
        const n = document.getElementById('gl-cold-n'); n.value = '4'; n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true }));
        return n.value;
      });
      console.log('420 展开①后首个控件高=' + vis + '  滑杆 n: ' + before + ' → ' + after + '（应改为 4）');
    }
    console.log('consoleIssues=' + logs.length + (logs.length ? ' :: ' + logs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
})();
