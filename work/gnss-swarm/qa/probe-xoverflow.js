'use strict';
/* probe-xoverflow: find which element makes #gnss-lab scrollWidth exceed clientWidth */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  for (const w of [420, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(2500);
    for (const tab of ['sky', 'mp', 'cold', 'pll']) {
      await p.click('#gl-tab-' + tab);
      await p.waitForTimeout(600);
      const r = await p.evaluate(() => {
        const lab = document.getElementById('gnss-lab');
        const lb = lab.getBoundingClientRect();
        const out = { labScroll: lab.scrollWidth - lab.clientWidth, labClient: lab.clientWidth, offenders: [] };
        lab.querySelectorAll('*').forEach(el => {
          const cs = getComputedStyle(el);
          const b2 = el.getBoundingClientRect();
          const selfOver = el.scrollWidth - el.clientWidth;
          const rightOver = b2.right - lb.right;
          if (rightOver > 0.5 || selfOver > 1) {
            if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden' || cs.overflowX === 'clip') return;
            out.offenders.push({
              tag: el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : ''),
              rightOver: +rightOver.toFixed(2), selfOver: selfOver, w: Math.round(b2.width)
            });
          }
        });
        out.offenders = out.offenders.slice(0, 8);
        return out;
      });
      console.log('W=' + w + ' tab=' + tab + ' ' + JSON.stringify(r));
    }
    await ctx.close();
  }
  await b.close();
})();
