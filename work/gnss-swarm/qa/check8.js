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
  /* GPS-only：ISB 无意义 */
  await fr.click(T.pos);
  await page.waitForTimeout(3400);
  report.states.gpsOnly = await read(fr, ['gl-pos-hrms', 'gl-pos-hrms-w', 'gl-pos-detail']);
  /* 三系统 + 估 ISB */
  await fr.click(T.sky);
  await page.waitForTimeout(700);
  await fr.selectOption('#gl-sys', 'GEC');
  await page.waitForTimeout(2000);
  await fr.click(T.pos);
  await page.waitForTimeout(3600);
  report.states.gecIsbOn = await read(fr, ['gl-pos-hrms', 'gl-pos-hrms-w', 'gl-pos-3rms', 'gl-pos-gdop', 'gl-pos-detail']);
  await page.screenshot({ path: OUT + '/80-pos-isb-on.png', fullPage: true });
  /* 关掉 ISB：同一批数据、单钟差估计 */
  await fr.uncheck('#gl-pos-isb');
  await page.waitForTimeout(3600);
  report.states.gecIsbOff = await read(fr, ['gl-pos-hrms', 'gl-pos-hrms-w', 'gl-pos-detail']);
  await page.screenshot({ path: OUT + '/81-pos-isb-off.png', fullPage: true });
  /* 回归：RAIM / 误差预算 */
  await fr.click(T.raim);
  await page.waitForTimeout(4600);
  report.states.raim = await read(fr, ['gl-raim-det', 'gl-raim-plain', 'gl-raim-after']);
  await fr.click(T.atm);
  await page.waitForTimeout(2600);
  report.states.atm = await read(fr, ['gl-atm-zen', 'gl-atm-low', 'gl-atm-err']);
  const dp = await browser.newPage({ viewport: { width: 960, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1300);
  await dfr.selectOption('#gl-sys', 'GEC');
  await dp.waitForTimeout(2000);
  await dfr.click(T.pos);
  await dp.waitForTimeout(3600);
  await dp.screenshot({ path: OUT + '/82-dark-pos-isb.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1300 });
  await dp.waitForTimeout(1000);
  report.states.narrow = await dfr.evaluate(() => ({ s: document.getElementById('gl-pos-scatter').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
