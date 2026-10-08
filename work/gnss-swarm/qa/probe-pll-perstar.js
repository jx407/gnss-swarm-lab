'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1400 } });
  await p.goto(PAGE_URL); await p.waitForTimeout(1500);
  let fr = null;
  for (const f of p.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) fr = f; } catch (e) { } }
  await fr.click('#gl-tab-cold'); await p.waitForTimeout(300);
  await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, h: (x.hatchCurve || []).length }; });
    if (!s.r && s.h > 0) break;
    await p.waitForTimeout(500);
  }
  const rows = await fr.evaluate(() => globalThis.GLAPP.panels.cold.state.pllStats);
  console.log('PRN      捕获频差(Hz)  lockQual  locked  max|相位误差|(rad)  细块数');
  for (const r of rows) {
    console.log(String(r.prn).padEnd(8) + String(isFinite(r.dopErr) ? r.dopErr.toFixed(1) : 'n/a').padStart(10) +
      String(r.lockQual.toFixed(4)).padStart(10) + String(r.locked).padStart(8) +
      String(r.maxErr.toFixed(3)).padStart(18) + String(r.fineBlocks).padStart(8));
  }
  await b.close();
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(1); });
