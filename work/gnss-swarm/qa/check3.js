'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const T = { sky: '#gl-tab-sky', pos: '#gl-tab-pos', mp: '#gl-tab-mp', raim: '#gl-tab-raim', geo: '#gl-tab-geo' };
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
  await page.waitForTimeout(1600);
  report.states.tabs = await fr.evaluate(() => Array.from(document.querySelectorAll('#gnss-lab [role=tab]')).map(b => b.textContent.trim()));
  await fr.click(T.geo);
  await page.waitForTimeout(2600);
  report.states.geo = await read(fr, ['gl-geo-here', 'gl-geo-here-ctx', 'gl-geo-best', 'gl-geo-best-ctx', 'gl-geo-worst', 'gl-geo-worst-ctx', 'gl-geo-detail']);
  await page.screenshot({ path: OUT + '/30-geo.png', fullPage: true });
  await fr.click(T.sky);
  await page.waitForTimeout(600);
  report.states.latBefore = (await read(fr, ['gl-lat-val']))['gl-lat-val'];
  await fr.locator('#gl-lat').fill('-14');
  await page.waitForTimeout(1600);
  report.states.latAfter = (await read(fr, ['gl-lat-val']))['gl-lat-val'];
  await fr.click(T.pos);
  await page.waitForTimeout(3200);
  report.states.posSouth = await read(fr, ['gl-pos-hrms', 'gl-pos-3rms', 'gl-pos-gdop', 'gl-pos-detail']);
  await fr.click(T.geo);
  await page.waitForTimeout(2600);
  report.states.geoSouth = await read(fr, ['gl-geo-here', 'gl-geo-here-ctx', 'gl-geo-detail']);
  await page.screenshot({ path: OUT + '/31-geo-south.png', fullPage: true });
  await fr.click(T.raim);
  await page.waitForTimeout(4500);
  report.states.raimSouth = await read(fr, ['gl-raim-det', 'gl-raim-plain', 'gl-raim-after', 'gl-raim-detail']);
  await fr.click(T.mp);
  await page.waitForTimeout(2200);
  report.states.mpSouth = await read(fr, ['gl-mp-extra', 'gl-mp-bias', 'gl-mp-err', 'gl-mp-detail']);
  await page.screenshot({ path: OUT + '/32-mp-south.png', fullPage: true });
  const dp = await browser.newPage({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1200);
  await dfr.click(T.geo);
  await dp.waitForTimeout(2600);
  await dp.screenshot({ path: OUT + '/33-dark-geo.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1300 });
  await dp.waitForTimeout(1000);
  report.states.narrowGeo = await dfr.evaluate(() => ({ w: document.getElementById('gl-geo-canvas').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
