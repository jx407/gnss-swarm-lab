'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const T = { sky: '#gl-tab-sky', acq: '#gl-tab-acq', pos: '#gl-tab-pos', mp: '#gl-tab-mp', raim: '#gl-tab-raim', geo: '#gl-tab-geo', atm: '#gl-tab-atm' };
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
  const page = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1700);
  report.states.tabs = await fr.evaluate(() => Array.from(document.querySelectorAll('#gnss-lab [role=tab]')).map(b => b.textContent.trim()));
  /* 定位面板：等权 vs 高程加权对照 */
  await fr.click(T.pos);
  await page.waitForTimeout(3600);
  report.states.pos = await read(fr, ['gl-pos-hrms', 'gl-pos-3rms', 'gl-pos-hrms-w', 'gl-pos-hrms-w-ctx', 'gl-pos-gdop', 'gl-pos-gdop-ctx', 'gl-pos-detail']);
  report.states.posCanvas = await fr.evaluate(() => ({ s: document.getElementById('gl-pos-scatter').clientWidth, h: document.getElementById('gl-pos-scatter').clientHeight }));
  await page.screenshot({ path: OUT + '/60-pos-weighted.png', fullPage: true });
  /* σ 拖大后两种估计量差距应当更明显 */
  await fr.locator('#gl-pos-sigma').fill('10');
  await page.waitForTimeout(3600);
  report.states.posSigma10 = await read(fr, ['gl-pos-hrms', 'gl-pos-hrms-w', 'gl-pos-hrms-w-ctx', 'gl-pos-detail']);
  /* 回归读其它面板 */
  for (const [k, ids] of [['acq', ['gl-acq-ratio']], ['mp', ['gl-mp-extra']], ['raim', ['gl-raim-det']], ['geo', ['gl-geo-here']], ['atm', ['gl-atm-zen', 'gl-atm-err']]]) {
    await fr.click(T[k]);
    await page.waitForTimeout(k === 'raim' ? 4200 : 2400);
    report.states[k] = await read(fr, ids);
  }
  report.states.about = await fr.evaluate(() => { const d = document.querySelector('#gnss-lab details'); if (d) d.open = true; return { items: d ? d.querySelectorAll('li').length : 0, readLines: document.querySelectorAll('#gnss-lab .gl-read').length }; });
  const dp = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1300);
  await dfr.click(T.pos);
  await dp.waitForTimeout(3600);
  await dp.screenshot({ path: OUT + '/61-dark-pos.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1300 });
  await dp.waitForTimeout(1000);
  report.states.narrow = await dfr.evaluate(() => ({ s: document.getElementById('gl-pos-scatter').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
