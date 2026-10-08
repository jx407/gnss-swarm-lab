'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const read = (fr, ids) => fr.evaluate(list => { const o = {}; for (const i of list) { const e = document.getElementById(i); o[i] = e ? e.textContent : 'MISSING'; } return o; }, ids);
(async () => {
  const browser = await chromium.launch();
  const logs = [];
  const page = await browser.newPage({ viewport: { width: 960, height: 1300 }, deviceScaleFactor: 2 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + (e && e.message)));
  await page.goto(URL);
  let fr = null;
  for (let i = 0; i < 40 && !fr; i++) { for (const f of page.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) { fr = f; break; } } catch (e) { } } if (!fr) await page.waitForTimeout(100); }
  await page.waitForTimeout(1500);
  await fr.click('#gl-tab-atm');
  await page.waitForTimeout(2500);
  await fr.click('#gl-atm-preset');
  await page.waitForTimeout(2500);
  const st = await read(fr, ['gl-atm-zen', 'gl-atm-low', 'gl-atm-act-val', 'gl-atm-sig-val', 'gl-atm-detail']);
  const box = await fr.locator('#gl-panel-atm').boundingBox();
  await page.screenshot({ path: OUT + '/130-atm-preset.png', clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 900) } });
  await browser.close();
  console.log(JSON.stringify({ stats: st, logs }, null, 1));
  process.exit(logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(2); });
