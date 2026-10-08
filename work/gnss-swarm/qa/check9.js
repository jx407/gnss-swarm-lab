'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const T = { sky: '#gl-tab-sky', pos: '#gl-tab-pos', raim: '#gl-tab-raim', atm: '#gl-tab-atm' };
const read = (fr, ids) => fr.evaluate(list => { const o = {}; for (const i of list) { const e = document.getElementById(i); o[i] = e ? e.textContent : 'MISSING'; } return o; }, ids);
function attach(page, logs) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + (e && e.message ? e.message : e)));
}
async function frag(page) {
  for (let i = 0; i < 40; i++) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) return f; } catch (e) { } }
    await page.waitForTimeout(100);
  }
  throw new Error('fragment frame not found');
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], states: {} };
  const page = await browser.newPage({ viewport: { width: 960, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1700);
  /* GPS-only 的 RAIM + 保护限级 */
  await fr.click(T.raim);
  await page.waitForTimeout(4800);
  report.states.gpsPl = await read(fr, ['gl-raim-det', 'gl-raim-plain', 'gl-raim-after', 'gl-raim-detail']);
  report.states.plCanvas = await fr.evaluate(() => { const c = document.getElementById('gl-raim-pl'); return { w: c.clientWidth, h: c.clientHeight }; });
  await page.screenshot({ path: OUT + '/90-raim-pl-gps.png', fullPage: true });
  /* 三系统：几何更好 → HPL/VPL 应更小 */
  await fr.click(T.sky);
  await page.waitForTimeout(700);
  await fr.selectOption('#gl-sys', 'GEC');
  await page.waitForTimeout(2000);
  await fr.click(T.raim);
  await page.waitForTimeout(5200);
  report.states.gecPl = await read(fr, ['gl-raim-det', 'gl-raim-plain', 'gl-raim-after', 'gl-raim-detail']);
  await page.screenshot({ path: OUT + '/91-raim-pl-gec.png', fullPage: true });
  /* 回归 */
  await fr.click(T.pos);
  await page.waitForTimeout(3600);
  report.states.pos = await read(fr, ['gl-pos-hrms', 'gl-pos-hrms-w', 'gl-pos-3rms']);
  await fr.click(T.atm);
  await page.waitForTimeout(2600);
  report.states.atm = await read(fr, ['gl-atm-zen', 'gl-atm-err']);
  const dp = await browser.newPage({ viewport: { width: 960, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1300);
  await dfr.click(T.raim);
  await dp.waitForTimeout(4800);
  await dp.screenshot({ path: OUT + '/92-dark-raim-pl.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1300 });
  await dp.waitForTimeout(1000);
  report.states.narrow = await dfr.evaluate(() => ({ pl: document.getElementById('gl-raim-pl').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
