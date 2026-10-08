'use strict';
/* probe-dark: true prefers-color-scheme dark emulation on the standalone page */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 980, height: 900 }, colorScheme: scheme, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const logs = [];
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    p.on('pageerror', e => logs.push('pageerror: ' + e.message));
    await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(2500);
    const info = await p.evaluate(() => {
      const cs = getComputedStyle(document.body);
      const lab = document.getElementById('gnss-lab');
      const c1 = document.getElementById('gl-sky-canvas');
      const c2 = document.getElementById('gl-dop-canvas');
      return {
        bodyBg: cs.backgroundColor, bodyFg: cs.color,
        varBackground: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
        varBorder: getComputedStyle(document.documentElement).getPropertyValue('--border').trim(),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        labScroll: lab.scrollWidth - lab.clientWidth,
        skyW: c1 ? c1.width + 'x' + c1.height : null, dopW: c2 ? c2.width + 'x' + c2.height : null
      };
    });
    await p.screenshot({ path: 'qa/v23-dark-' + scheme + '.png' });
    console.log(scheme + ' ' + JSON.stringify(info) + ' consoleIssues=' + logs.length + (logs.length ? ' :: ' + logs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
})();
