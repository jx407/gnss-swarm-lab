'use strict';
/* probe-adc-sweep：把冷启动面板的「接收机采样率」扫 4/16/40，如实打印所有判据相关量 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
async function frag(page) {
  for (let i = 0; i < 40; i++) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) return f; } catch (e) { } }
    await page.waitForTimeout(100);
  }
  throw new Error('fragment frame not found');
}
(async () => {
  const browser = await chromium.launch();
  const logs = [];
  const page = await browser.newPage({ viewport: { width: 980, height: 1800 }, deviceScaleFactor: 1, colorScheme: 'light' });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + (e && e.message ? e.message : e)));
  await page.goto(PAGE_URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  await fr.click('#gl-tab-cold');
  for (const spc of [4, 16, 40]) {
    await fr.evaluate((v) => {
      const el = document.getElementById('gl-cold-fine');
      el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, spc);
    /* 等上一次自动重跑结束 */
    for (let i = 0; i < 200; i++) { if (!(await fr.evaluate(() => globalThis.GLAPP.panels.cold.state.running))) break; await page.waitForTimeout(300); }
    await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
    await fr.click('#gl-cold-run');
    const t0 = Date.now();
    for (;;) {
      const st = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, c: (x.errCurve || []).length, h: (x.hatchCurve || []).length }; });
      if (!st.r && st.c > 0 && st.h > 0) break;
      if (Date.now() - t0 > 240000) throw new Error('timeout at spc=' + spc);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(300);
    const r = await fr.evaluate(() => {
      const x = globalThis.GLAPP.panels.cold.state;
      return { fineSpc: x.fineSpc, fineN: x.fineN, fineMs: x.fineMs, plateauM: x.finePlateauM, sigmaM: x.fineSigmaM,
        edge: x.fineEdge, chipsRms: x.chipsRms, rawRms: x.rawRms, hatchRms: x.hatchRms, kfRms: x.kfRms,
        err: x.err, err1: x.err1, pll: x.pllLocked, pass2: x.pllPass2Count, ttff: x.ttff, msTrack: x.msPerTrack,
        detail: document.getElementById('gl-cold-detail').textContent };
    });
    console.log('spc=' + spc + ' | fineN=' + r.fineN + ' 平台=' + r.plateauM.toFixed(1) + 'm 下限=' + r.sigmaM.toFixed(1) + 'm edge=' + r.edge +
      ' | 码相位RMS=' + r.chipsRms.toFixed(1) + 'm | 首历元定位=' + r.err1.toFixed(0) + 'm 末历元=' + r.err.toFixed(0) +
      'm rawRMS=' + r.rawRms.toFixed(1) + ' hatch=' + r.hatchRms.toFixed(1) + ' kf=' + r.kfRms.toFixed(1) +
      'm | PLL ' + r.pll + '/6 pass2=' + r.pass2 + ' | TTFF=' + r.ttff.toFixed(0) + 'ms 跟踪=' + r.msTrack.toFixed(2) + 'ms 细修=' + r.fineMs.toFixed(0) + 'ms');
    if (spc === 16) console.log('  明细: ' + r.detail.slice(0, 300));
  }
  console.log('控制台问题 ' + logs.length + ' 条: ' + logs.slice(0, 5).join(' | '));
  await page.screenshot({ path: 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa/240-adc-sweep.png', fullPage: true });
  await browser.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
