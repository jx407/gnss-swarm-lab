'use strict';
/* probe-mobile44: coarse-pointer touch targets after the 44px rules + no overflow */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium, devices } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  for (const w of [360, 390]) {
    const ctx = await b.newContext(Object.assign({}, devices['iPhone 12'], { viewport: { width: w, height: 844 } }));
    const p = await ctx.newPage();
    const logs = [];
    p.on('pageerror', e => logs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(2000);
    const r = await p.evaluate(() => {
      const q = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : null; };
      const w2 = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : null; };
      const lab = document.getElementById('gnss-lab');
      const nav = lab.querySelector('.nav.nav-pills');
      const tabs = Array.prototype.slice.call(nav.querySelectorAll('.nav-link'));
      const tops = {}; tabs.forEach(t => { tops[Math.round(t.getBoundingClientRect().top)] = 1; });
      return {
        coarse: matchMedia('(pointer: coarse)').matches,
        tabH: Math.round(tabs[0].getBoundingClientRect().height), tabRows: Object.keys(tops).length,
        navH: Math.round(nav.getBoundingClientRect().height),
        rangeH: q('#gl-lat'), selectH: q('#gl-const-src'), btnH: q('#gl-acq-run'), summaryH: q('.gl-glossary > summary'),
        checkboxW: w2('#gl-cold-kf') || w2('#gl-pos-isb'),
        labScroll: lab.scrollWidth - lab.clientWidth,
        docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        labH: Math.round(lab.getBoundingClientRect().height)
      };
    });
    console.log('W=' + w + ' ' + JSON.stringify(r) + ' consoleIssues=' + logs.length + (logs.length ? ' :: ' + logs.join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
})();
