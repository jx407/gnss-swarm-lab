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
async function waitDone(fr, page, timeoutMs) {
  const t0 = Date.now();
  let started = false;
  while (Date.now() - t0 < timeoutMs) {
    const s = await fr.evaluate(() => ({ running: globalThis.GLAPP.panels.cold.state.running, n: (globalThis.GLAPP.panels.cold.state.items || []).length, curve: (globalThis.GLAPP.panels.cold.state.errCurve || []).length }));
    if (s.running || s.n > 0) started = true;
    if (started && !s.running && s.curve > 0) return true;
    await page.waitForTimeout(400);
  }
  return false;
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], states: {} };
  const page = await browser.newPage({ viewport: { width: 960, height: 1400 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1800);
  /* 默认 N=8 */
  await fr.click('#gl-tab-cold');
  await waitDone(fr, page, 30000);
  await page.waitForTimeout(600);
  report.states.n8 = await read(fr, ['gl-cold-time', 'gl-cold-time-ctx', 'gl-cold-ok', 'gl-cold-ok-ctx', 'gl-cold-err', 'gl-cold-err-ctx', 'gl-cold-detail']);
  report.states.curve = await fr.evaluate(() => (globalThis.GLAPP.panels.cold.state.errCurve || []).map(p => ({ n: p.n, err: Math.round(p.err) })));
  report.states.canvases = await fr.evaluate(() => ['gl-cold-canvas', 'gl-cold-ttff', 'gl-cold-epoch-canvas'].map(id => ({ id: id, w: document.getElementById(id).clientWidth, h: document.getElementById(id).clientHeight })));
  await page.screenshot({ path: OUT + '/110-cold-n8.png', fullPage: true });
  /* N=1 对照 */
  await fr.locator('#gl-cold-epochs').fill('1');
  await page.waitForTimeout(300);
  await fr.click('#gl-cold-run');
  await waitDone(fr, page, 20000);
  await page.waitForTimeout(500);
  report.states.n1 = await read(fr, ['gl-cold-time', 'gl-cold-err', 'gl-cold-err-ctx', 'gl-cold-detail']);
  await page.screenshot({ path: OUT + '/111-cold-n1.png', fullPage: true });
  const dp = await browser.newPage({ viewport: { width: 960, height: 1400 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1300);
  await dfr.click('#gl-tab-cold');
  await waitDone(dfr, dp, 30000);
  await dp.waitForTimeout(500);
  await dp.screenshot({ path: OUT + '/112-dark-cold.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1400 });
  await dp.waitForTimeout(1000);
  report.states.narrow = await dfr.evaluate(() => ({ c: document.getElementById('gl-cold-canvas').clientWidth, e: document.getElementById('gl-cold-epoch-canvas').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
