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
  for (let i = 1; i <= 3; i++) {
    await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
    await fr.click('#gl-cold-run');
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const s = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, c: (x.errCurve || []).length, h: (x.hatchCurve || []).length }; });
      if (!s.r && s.c > 0 && s.h > 0) break;
      await p.waitForTimeout(300);
    }
    const v = await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; return { raw: s.rawRms, hatch: s.hatchRms, kf: s.kfRms, n: s.items.length, stepS: s.stepS, mode: s.mode }; });
    console.log('第 ' + i + ' 次：raw=' + v.raw.toFixed(3) + ' hatch=' + v.hatch.toFixed(3) + ' kf=' + v.kf.toFixed(3) + ' (n=' + v.n + ', step=' + v.stepS + ', mode=' + v.mode + ')');
  }
  await b.close();
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(1); });
