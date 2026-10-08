'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const TAB = { sky: '#gl-tab-sky', ca: '#gl-tab-ca', acq: '#gl-tab-acq', pos: '#gl-tab-pos' };
const txt = (fr, id) => fr.evaluate(i => { const e = document.getElementById(i); return e ? e.textContent : 'MISSING:' + i; }, id);
const readMany = (fr, ids) => fr.evaluate(list => { const o = {}; for (const i of list) { const e = document.getElementById(i); o[i] = e ? e.textContent : 'MISSING'; } return o; }, ids);

function attach(page, logs) {
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + (e && e.message ? e.message : e)));
}
async function frag(page) {
  for (let i = 0; i < 40; i++) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) return f; } catch (e) { }
    }
    await page.waitForTimeout(100);
  }
  throw new Error('fragment frame not found');
}
async function reportState(fr) { return fr.evaluate(() => ({ ready: document.readyState, hasGnss: !!globalThis.GNSS, hasApp: !!globalThis.GLAPP, stat: (document.getElementById('gl-sky-n') || {}).textContent })); }

(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], states: {} };
  const page = await browser.newPage({ viewport: { width: 820, height: 1200 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  report.states.initial = await reportState(fr);
  await page.waitForTimeout(1500);
  report.states.sky = { ...(await readMany(fr, ['gl-sky-n', 'gl-sky-pdop', 'gl-sky-gdop', 'gl-sky-detail'])), w: await fr.evaluate(() => document.getElementById('gl-sky-canvas').clientWidth) };
  await page.screenshot({ path: OUT + '/10-sky.png', fullPage: true });

  const bb = await fr.locator('#gl-dop-canvas').boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.72, bb.y + bb.height * 0.5);
  await page.waitForTimeout(400);
  report.states.skyClick = { hours: await fr.evaluate(() => document.getElementById('gl-hours').value), pdop: await txt(fr, 'gl-sky-pdop') };

  await fr.click(TAB.ca); await page.waitForTimeout(1200);
  await fr.selectOption('#gl-prn2', '24'); await page.waitForTimeout(1200);
  report.states.ca = await readMany(fr, ['gl-ca-auto', 'gl-ca-cross', 'gl-ca-bal', 'gl-ca-detail']);
  await page.screenshot({ path: OUT + '/11-ca.png', fullPage: true });

  await fr.click(TAB.acq); await page.waitForTimeout(2000);
  report.states.acq = await readMany(fr, ['gl-acq-p', 'gl-acq-f', 'gl-acq-ratio', 'gl-acq-time', 'gl-acq-detail']);
  await page.screenshot({ path: OUT + '/12-acq.png', fullPage: true });

  await fr.click(TAB.pos); await page.waitForTimeout(3000);
  report.states.pos = await readMany(fr, ['gl-pos-hrms', 'gl-pos-3rms', 'gl-pos-gdop', 'gl-pos-detail']);
  await page.screenshot({ path: OUT + '/13-pos.png', fullPage: true });

  await fr.click(TAB.sky); await page.waitForTimeout(600);
  await page.setViewportSize({ width: 360, height: 1200 });
  await page.waitForTimeout(900);
  report.states.narrow = await fr.evaluate(() => ({ sky: document.getElementById('gl-sky-canvas').clientWidth, dop: document.getElementById('gl-dop-canvas').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await page.screenshot({ path: OUT + '/14-narrow.png', fullPage: true });

  const dp = await browser.newPage({ viewport: { width: 820, height: 1200 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1200);
  await dfr.click(TAB.acq); await dp.waitForTimeout(2000);
  await dp.screenshot({ path: OUT + '/15-dark-acq.png', fullPage: true });
  await dfr.click(TAB.pos); await dp.waitForTimeout(3000);
  await dp.screenshot({ path: OUT + '/16-dark-pos.png', fullPage: true });
  report.states.dark = { canvasBg: await dfr.evaluate(() => { const c = document.getElementById('gl-acq-canvas'); return getComputedStyle(c).backgroundColor; }) };

  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
