'use strict';
/* probe-hatch-diag：对比理想方波 / 4MHz 带限两档的逐历元曲线，定位 Hatch/KF 退化的形态（偏置 vs 漂移） */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
async function frag(page) { for (let i = 0; i < 40; i++) { for (const f of page.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) return f; } catch (e) {} } await page.waitForTimeout(100); } throw new Error('no frag'); }
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1200 } });
  await p.goto(PAGE_URL); const fr = await frag(p); await p.waitForTimeout(1500);
  await fr.click('#gl-tab-cold');
  for (const bw of [0, 4]) {
    await fr.evaluate((v) => {
      const f = document.getElementById('gl-cold-fine'); f.value = '16'; f.dispatchEvent(new Event('change', { bubbles: true }));
      const g = document.getElementById('gl-cold-frontbw'); g.value = String(v); g.dispatchEvent(new Event('change', { bubbles: true }));
    }, bw);
    for (let i = 0; i < 400; i++) { if (!(await fr.evaluate(() => !globalThis.GLAPP.panels.cold.state.running))) break; await p.waitForTimeout(300); }
    await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; s.kfCurve = []; });
    await fr.click('#gl-cold-run');
    for (let i = 0; i < 600; i++) { const done = await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; return !s.running && s.errCurve.length > 0 && s.hatchCurve.length > 0; }); if (done) break; await p.waitForTimeout(400); }
    await p.waitForTimeout(400);
    const r = await fr.evaluate(() => {
      const s = globalThis.GLAPP.panels.cold.state;
      const f = (a) => a.map(x => (x.err == null || !isFinite(x.err)) ? 'NaN' : x.err.toFixed(1)).join(' ');
      return { bw: s.frontBw, chips: s.chipsRms, raw: s.rawRms, hatch: s.hatchRms, kf: s.kfRms,
        rawCurve: f(s.errCurve), hatchCurve: f(s.hatchCurve), kfCurve: f(s.kfCurve || []),
        pll: (s.pllStats || []).map(x => x.prn + ':q' + (x.lockQual || 0).toFixed(4) + '/e' + (x.maxErr || 0).toFixed(3) + '/dop' + (x.dopErr || 0).toFixed(0)).join(' ') };
    });
    console.log('=== 前端 ' + (r.bw === 0 ? '理想方波' : r.bw + ' MHz') + ' ===');
    console.log('  码相位 RMS ' + r.chips.toFixed(1) + ' m | 原始 ' + r.raw.toFixed(1) + ' | Hatch ' + r.hatch.toFixed(1) + ' | KF ' + r.kf.toFixed(1) + ' m');
    console.log('  原始逐历元   : ' + r.rawCurve);
    console.log('  Hatch 逐历元 : ' + r.hatchCurve);
    console.log('  KF   逐历元 : ' + r.kfCurve);
    console.log('  PLL: ' + r.pll);
  }
  await b.close();
})();
