'use strict';
/* probe-chrome: measures page chrome (h1 / sticky nav rows+height / glossary block) at 5 widths */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  for (const w of [360, 420, 768, 980, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const logs = [];
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    p.on('pageerror', e => logs.push('pageerror: ' + e.message));
    await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(2000);
    const info = await p.evaluate(() => {
      const lab = document.getElementById('gnss-lab');
      const nav = lab.querySelector('.nav.nav-pills');
      const h1 = lab.querySelector('h1');
      const gl = lab.querySelector('.gl-glossary');
      const btns = nav ? Array.prototype.slice.call(nav.querySelectorAll('.nav-link')) : [];
      const tops = {};
      btns.forEach(bt => { tops[Math.round(bt.getBoundingClientRect().top)] = 1; });
      const r = gl ? gl.getBoundingClientRect() : null;
      return {
        h1: h1 ? h1.textContent.trim() : null,
        h1px: h1 ? getComputedStyle(h1).fontSize : null,
        navH: nav ? Math.round(nav.getBoundingClientRect().height) : null,
        navRows: Object.keys(tops).length,
        btnH: btns.length ? Math.round(btns[0].getBoundingClientRect().height) : null,
        navFontPx: btns.length ? getComputedStyle(btns[0]).fontSize : null,
        glossary: !!gl,
        glossaryClosedH: r ? Math.round(r.height) : null,
        glossaryOpen: gl ? gl.open : null,
        labH: Math.round(lab.getBoundingClientRect().height),
        docH: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        canvases: lab.querySelectorAll('canvas').length,
        canvZero: Array.prototype.filter.call(lab.querySelectorAll('canvas'), c => c.clientWidth < 5).length
      };
    });
    console.log('W=' + w + ' ' + JSON.stringify(info) + ' consoleIssues=' + logs.length + (logs.length ? ' :: ' + logs.join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
})();
