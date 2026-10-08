'use strict';
/* probe-leadfold: is the per-panel lead ("这一页…") now the first thing after the h2, and on the first screen at 420? */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const TABS = ['sky', 'ca', 'acq', 'pos', 'mp', 'raim', 'geo', 'atm', 'cold', 'pll'];
(async () => {
  const b = await chromium.launch();
  for (const vp of [{ w: 420, h: 844 }, { w: 980, h: 900 }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p = await ctx.newPage();
    const logs = [];
    p.on('pageerror', e => logs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html', { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(1800);
    const rows = [];
    for (const t of TABS) {
      await p.click('#gl-tab-' + t);
      await p.waitForTimeout(400);
      const r = await p.evaluate((tb) => {
        const panel = document.getElementById('gl-panel-' + tb);
        const h2 = panel.querySelector(':scope > h2.gl-h2');
        const lead = panel.querySelector(':scope > p.gl-lead');
        const rect = lead ? lead.getBoundingClientRect() : null;
        const labTop = document.getElementById('gnss-lab').getBoundingClientRect().top;
        return { order: !!(h2 && lead && h2.nextElementSibling === lead), leadTop: rect ? Math.round(rect.top - labTop) : null,
                 leadChars: lead ? lead.textContent.length : 0, firstScreen: rect ? rect.top < window.innerHeight : null,
                 panelH: Math.round(panel.getBoundingClientRect().height) };
      }, t);
      rows.push(t + ' order=' + (r.order ? 'ok' : 'NO') + ' leadTop=' + r.leadTop + ' firstScreen=' + r.firstScreen + ' chars=' + r.leadChars + ' panelH=' + r.panelH);
    }
    console.log('=== ' + vp.w + 'x' + vp.h + ' ===');
    console.log(rows.join('\n'));
    console.log('consoleIssues=' + logs.length + (logs.length ? ' :: ' + logs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
})();
