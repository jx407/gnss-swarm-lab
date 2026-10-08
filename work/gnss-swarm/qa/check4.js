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
  /* 键盘路径：用下拉选择卫星（不点画布） */
  await fr.selectOption('#gl-sky-prn', '5');
  await page.waitForTimeout(800);
  report.states.skyKeyboard = await read(fr, ['gl-sky-detail']);
  report.states.skyDoppler = await fr.evaluate(() => {
    const cv = document.getElementById('gl-doppler-canvas');
    const v = globalThis.GLAPP.panels.sky.currentDoppler ? globalThis.GLAPP.panels.sky.currentDoppler() : NaN;
    return { w: cv.clientWidth, h: cv.clientHeight, doppler: isFinite(v) ? Math.round(v) : null, sel: globalThis.GLAPP.state.selPrn };
  });
  await fr.click('#gl-dop-to-acq');
  await page.waitForTimeout(900);
  report.states.coupling = await read(fr, ['gl-acq-dop-val']);
  /* 新面板：误差预算 */
  await fr.click(T.atm);
  await page.waitForTimeout(2600);
  report.states.atm = await read(fr, ['gl-atm-zen', 'gl-atm-zen-ctx', 'gl-atm-low', 'gl-atm-low-ctx', 'gl-atm-err', 'gl-atm-err-ctx', 'gl-atm-detail']);
  report.states.atmCanvas = await fr.evaluate(() => ({ a: document.getElementById('gl-atm-canvas').clientWidth, b: document.getElementById('gl-atm-err-canvas').clientWidth }));
  await page.screenshot({ path: OUT + '/40-atm.png', fullPage: true });
  await fr.selectOption('#gl-atm-freq', '1227.60');
  await page.waitForTimeout(1600);
  report.states.atmL2 = await read(fr, ['gl-atm-zen', 'gl-atm-zen-ctx', 'gl-atm-err', 'gl-atm-detail']);
  await fr.locator('#gl-atm-corr').fill('0');
  await page.waitForTimeout(600);
  report.states.atmCorr0 = await read(fr, ['gl-atm-err', 'gl-atm-err-ctx']);
  await page.screenshot({ path: OUT + '/41-atm-l2-corr0.png', fullPage: true });
  /* 回归：其它面板仍出数 */
  for (const [k, ids] of [['acq', ['gl-acq-p', 'gl-acq-ratio']], ['pos', ['gl-pos-hrms', 'gl-pos-gdop']], ['mp', ['gl-mp-extra', 'gl-mp-bias']], ['raim', ['gl-raim-det', 'gl-raim-plain']], ['geo', ['gl-geo-here']]]) {
    await fr.click(T[k]);
    await page.waitForTimeout(k === 'raim' ? 4200 : 2200);
    report.states[k] = await read(fr, ids);
  }
  const dp = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1300);
  await dfr.click(T.atm);
  await dp.waitForTimeout(2600);
  await dp.screenshot({ path: OUT + '/42-dark-atm.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1300 });
  await dp.waitForTimeout(1000);
  report.states.narrow = await dfr.evaluate(() => ({ a: document.getElementById('gl-atm-canvas').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
