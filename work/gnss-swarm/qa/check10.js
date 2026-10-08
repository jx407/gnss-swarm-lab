'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
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
  await page.waitForTimeout(1800);
  report.states.tabs = await fr.evaluate(() => Array.from(document.querySelectorAll('#gnss-lab [role=tab]')).map(b => b.textContent.trim()));
  await fr.click('#gl-tab-cold');
  await page.waitForTimeout(7000);
  report.states.cold6 = await read(fr, ['gl-cold-time', 'gl-cold-time-ctx', 'gl-cold-ok', 'gl-cold-ok-ctx', 'gl-cold-err', 'gl-cold-err-ctx', 'gl-cold-detail']);
  await page.screenshot({ path: OUT + '/100-cold.png', fullPage: true });
  /* 8 颗 + 再跑一次 */
  await fr.locator('#gl-cold-n').fill('8');
  await page.waitForTimeout(400);
  await fr.click('#gl-cold-run');
  await page.waitForTimeout(9000);
  report.states.cold8 = await read(fr, ['gl-cold-time', 'gl-cold-ok', 'gl-cold-err', 'gl-cold-detail']);
  await page.screenshot({ path: OUT + '/101-cold8.png', fullPage: true });
  /* 回归：其它面板仍正常 */
  await fr.click('#gl-tab-pos');
  await page.waitForTimeout(3400);
  report.states.pos = await read(fr, ['gl-pos-hrms', 'gl-pos-hrms-w']);
  await fr.click('#gl-tab-raim');
  await page.waitForTimeout(4600);
  report.states.raim = await read(fr, ['gl-raim-det', 'gl-raim-detail']);
  const dp = await browser.newPage({ viewport: { width: 960, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1300);
  await dfr.click('#gl-tab-cold');
  await dp.waitForTimeout(7000);
  await dp.screenshot({ path: OUT + '/102-dark-cold.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1300 });
  await dp.waitForTimeout(1000);
  report.states.narrow = await dfr.evaluate(() => ({ c: document.getElementById('gl-cold-canvas').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
