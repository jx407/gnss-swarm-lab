'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const TABS = { sky: '#gl-tab-sky', ca: '#gl-tab-ca', acq: '#gl-tab-acq', pos: '#gl-tab-pos', mp: '#gl-tab-mp', raim: '#gl-tab-raim' };
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
  const page = await browser.newPage({ viewport: { width: 880, height: 1200 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  report.states.sky = await read(fr, ['gl-sky-n', 'gl-sky-pdop', 'gl-sky-gdop', 'gl-sky-detail']);
  /* 选一颗卫星 → 看多普勒面板 + 联动按钮 */
  const hit = await fr.evaluate(() => (globalThis.GLAPP.panels.sky.hit || []).slice(0, 3));
  if (hit.length) {
    const bb = await fr.locator('#gl-sky-canvas').boundingBox();
    await page.mouse.click(bb.x + hit[0].x, bb.y + hit[0].y);
    await page.waitForTimeout(600);
    report.states.skySelected = await read(fr, ['gl-sky-detail']);
    report.states.skySelected.selPrn = await fr.evaluate(() => globalThis.GLAPP.state.selPrn);
    const dv = await fr.evaluate(() => { const el = document.getElementById('gl-doppler-canvas'); return globalThis.GLAPP.panels.sky.currentDoppler ? Math.round(globalThis.GLAPP.panels.sky.currentDoppler()) : null; });
    report.states.skySelected.doppler = dv;
    await fr.click('#gl-dop-to-acq');
    await page.waitForTimeout(900);
    report.states.coupling = await read(fr, ['gl-acq-dop-val', 'gl-acq-detail']);
  }
  await page.screenshot({ path: OUT + '/20-sky.png', fullPage: true });
  for (const [k, name] of [['acq', '21-acq'], ['pos', '22-pos'], ['mp', '23-mp'], ['raim', '24-raim']]) {
    await fr.click(TABS[k]);
    await page.waitForTimeout(k === 'raim' ? 4000 : 2600);
    const ids = k === 'acq' ? ['gl-acq-p', 'gl-acq-f', 'gl-acq-ratio', 'gl-acq-time', 'gl-acq-detail']
      : k === 'pos' ? ['gl-pos-hrms', 'gl-pos-3rms', 'gl-pos-gdop', 'gl-pos-detail']
        : k === 'mp' ? ['gl-mp-extra', 'gl-mp-bias', 'gl-mp-err', 'gl-mp-detail']
          : ['gl-raim-det', 'gl-raim-det-ctx', 'gl-raim-plain', 'gl-raim-after', 'gl-raim-detail'];
    report.states[k] = await read(fr, ids);
    await page.screenshot({ path: OUT + '/' + name + '.png', fullPage: true });
  }
  /* 说明区展开 */
  report.states.about = await fr.evaluate(() => { const d = document.querySelector('#gnss-lab details'); if (d) d.open = true; return { has: !!d, items: d ? d.querySelectorAll('li').length : 0, readLines: document.querySelectorAll('#gnss-lab .gl-read').length }; });
  await page.screenshot({ path: OUT + '/25-about.png', fullPage: true });
  await page.setViewportSize({ width: 380, height: 1200 });
  await fr.click(TABS.mp);
  await page.waitForTimeout(900);
  report.states.narrow = await fr.evaluate(() => ({ mp: document.getElementById('gl-mp-canvas').clientWidth, curve: document.getElementById('gl-mp-curve').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await page.screenshot({ path: OUT + '/26-narrow-mp.png', fullPage: true });
  const dp = await browser.newPage({ viewport: { width: 880, height: 1200 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1200);
  await dfr.click(TABS.raim);
  await dp.waitForTimeout(4000);
  await dp.screenshot({ path: OUT + '/27-dark-raim.png', fullPage: true });
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
