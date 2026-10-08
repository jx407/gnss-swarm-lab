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
  await fr.click('#gl-tab-atm');
  await page.waitForTimeout(2600);
  report.states.quiet = await read(fr, ['gl-atm-zen', 'gl-atm-low', 'gl-atm-err', 'gl-atm-act-val', 'gl-atm-sig-val', 'gl-atm-detail']);
  await page.screenshot({ path: OUT + '/120-atm-quiet.png', fullPage: true });
  /* 活跃电离层 ×20 */
  await fr.locator('#gl-atm-act').fill('20');
  await page.waitForTimeout(2400);
  report.states.storm = await read(fr, ['gl-atm-zen', 'gl-atm-low', 'gl-atm-err', 'gl-atm-act-val', 'gl-atm-detail']);
  await page.screenshot({ path: OUT + '/121-atm-storm.png', fullPage: true });
  /* 大噪声 σ=5：双频的噪声代价应更明显 */
  await fr.locator('#gl-atm-sig').fill('5');
  await page.waitForTimeout(2400);
  report.states.stormNoisy = await read(fr, ['gl-atm-err', 'gl-atm-sig-val', 'gl-atm-detail']);
  /* 回归：其它面板 */
  await fr.click('#gl-tab-cold');
  await page.waitForTimeout(6000);
  report.states.cold = await read(fr, ['gl-cold-time', 'gl-cold-ok', 'gl-cold-err']);
  await fr.click('#gl-tab-raim');
  await page.waitForTimeout(4800);
  report.states.raim = await read(fr, ['gl-raim-det', 'gl-raim-detail']);
  const dp = await browser.newPage({ viewport: { width: 960, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1300);
  await dfr.click('#gl-tab-atm');
  await dp.waitForTimeout(2600);
  await dp.screenshot({ path: OUT + '/122-dark-atm.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1300 });
  await dp.waitForTimeout(1000);
  report.states.narrow = await dfr.evaluate(() => ({ a: document.getElementById('gl-atm-canvas').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
