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
  const page = await browser.newPage({ viewport: { width: 940, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1800);
  report.states.gps = await read(fr, ['gl-sky-n', 'gl-sky-n-ctx', 'gl-sky-pdop', 'gl-sky-gdop', 'gl-sky-detail']);
  report.states.selectGps = await fr.evaluate(() => { const s = document.getElementById('gl-sky-prn'); return { options: s.options.length, first: s.options[0] ? s.options[0].textContent : '', last: s.options.length ? s.options[s.options.length - 1].textContent : '' }; });
  await page.screenshot({ path: OUT + '/70-sky-gps.png', fullPage: true });
  /* 切到三系统 */
  await fr.selectOption('#gl-sys', 'GEC');
  await page.waitForTimeout(2200);
  report.states.gec = await read(fr, ['gl-sky-n', 'gl-sky-n-ctx', 'gl-sky-pdop', 'gl-sky-gdop', 'gl-sky-detail']);
  report.states.selectGec = await fr.evaluate(() => { const s = document.getElementById('gl-sky-prn'); return { options: s.options.length, first: s.options[0] ? s.options[0].textContent : '', mid: s.options[Math.floor(s.options.length / 2)] ? s.options[Math.floor(s.options.length / 2)].textContent : '' }; });
  await page.screenshot({ path: OUT + '/71-sky-gec.png', fullPage: true });
  /* 三系统下的定位 / RAIM / 误差预算 */
  await fr.click(T.pos);
  await page.waitForTimeout(3600);
  report.states.posGec = await read(fr, ['gl-pos-hrms', 'gl-pos-hrms-w', 'gl-pos-3rms', 'gl-pos-gdop', 'gl-pos-detail']);
  await fr.click(T.raim);
  await page.waitForTimeout(4600);
  report.states.raimGec = await read(fr, ['gl-raim-det', 'gl-raim-plain', 'gl-raim-after', 'gl-raim-detail']);
  await fr.click(T.geo);
  await page.waitForTimeout(3000);
  report.states.geoGec = await read(fr, ['gl-geo-here', 'gl-geo-here-ctx', 'gl-geo-best', 'gl-geo-detail']);
  await fr.click(T.atm);
  await page.waitForTimeout(2600);
  report.states.atmGec = await read(fr, ['gl-atm-zen', 'gl-atm-low', 'gl-atm-err', 'gl-atm-detail']);
  /* 选一颗非 GPS 卫星，看捕获联动的守卫 */
  await fr.click(T.sky);
  await page.waitForTimeout(900);
  const nonGps = await fr.evaluate(() => { const s = document.getElementById('gl-sky-prn'); for (const o of s.options) if (o.value[0] !== 'G') return o.value; return ''; });
  if (nonGps) {
    await fr.selectOption('#gl-sky-prn', nonGps);
    await page.waitForTimeout(800);
    await fr.click('#gl-dop-to-acq');
    await page.waitForTimeout(600);
    report.states.nonGpsGuard = await read(fr, ['gl-sky-detail']);
  }
  /* 回到 GPS 再看多普勒联动仍正常 */
  await fr.selectOption('#gl-sky-prn', report.states.selectGps.last && report.states.selectGps.last.indexOf('G') >= 0 ? 'G01' : '1');
  await page.waitForTimeout(800);
  report.states.gpsDoppler = await fr.evaluate(() => { const ser = globalThis.GLAPP.panels.sky.dopplerSeries ? globalThis.GLAPP.panels.sky.dopplerSeries('G01') : []; const fin = ser.filter(p => isFinite(p[1])).length; return { samples: ser.length, finite: fin, sel: globalThis.GLAPP.state.selPrn }; });
  const dp = await browser.newPage({ viewport: { width: 940, height: 1300 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1300);
  await dfr.selectOption('#gl-sys', 'GEC');
  await dp.waitForTimeout(2200);
  await dp.screenshot({ path: OUT + '/72-dark-sky-gec.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1300 });
  await dp.waitForTimeout(1000);
  report.states.narrow = await dfr.evaluate(() => ({ sky: document.getElementById('gl-sky-canvas').clientWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 }));
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
