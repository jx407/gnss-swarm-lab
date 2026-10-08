'use strict';
/* probe-frontbw：把冷启动面板的「前端带宽」扫 0/8/4/2 MHz（ADC 档固定 16），如实打印所有量 */
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
  const page = await browser.newPage({ viewport: { width: 980, height: 1900 }, deviceScaleFactor: 1, colorScheme: 'light' });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + (e && e.message ? e.message : e)));
  await page.goto(PAGE_URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  await fr.click('#gl-tab-cold');
  for (const bw of [0, 8, 4, 2]) {
    await fr.evaluate((v) => {
      const s = document.getElementById('gl-cold-fine'); s.value = '16'; s.dispatchEvent(new Event('change', { bubbles: true }));
      const f = document.getElementById('gl-cold-frontbw'); f.value = String(v); f.dispatchEvent(new Event('change', { bubbles: true }));
    }, bw);
    for (let i = 0; i < 300; i++) { if (!(await fr.evaluate(() => globalThis.GLAPP.panels.cold.state.running))) break; await page.waitForTimeout(300); }
    await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
    await fr.click('#gl-cold-run');
    const t0 = Date.now();
    for (;;) {
      const st = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, c: (x.errCurve || []).length, h: (x.hatchCurve || []).length }; });
      if (!st.r && st.c > 0 && st.h > 0) break;
      if (Date.now() - t0 > 240000) throw new Error('timeout bw=' + bw);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(300);
    const r = await fr.evaluate(() => {
      const x = globalThis.GLAPP.panels.cold.state;
      return { bw: x.frontBw, spc: x.fineSpc, n: x.fineN, smooth: x.fineSmooth, est: x.fineEstimator, weak: x.fineWeak,
        plateauM: x.finePlateauM, sigmaM: x.fineSigmaM, e0: x.fineN0 ? Math.sqrt(x.fineErr0Sum / x.fineN0) : NaN,
        chipsRms: x.chipsRms, rawRms: x.rawRms, hatchRms: x.hatchRms, kfRms: x.kfRms, err: x.err, err1: x.err1,
        pll: x.pllLocked, ttff: x.ttff, fineMs: x.fineMs, msTrack: x.msPerTrack,
        detail: document.getElementById('gl-cold-detail').textContent };
    });
    console.log('前端=' + (bw === 0 ? '理想方波' : bw + 'MHz').padEnd(10) + ' 光滑丘判定 ' + r.smooth + '/' + r.n + ' 估计器=' + r.est + ' 弱=' + r.weak +
      ' | 首历元精修RMS=' + r.e0.toFixed(2) + 'm 链路码相位RMS=' + r.chipsRms.toFixed(1) + 'm' +
      ' | 原始定位RMS=' + r.rawRms.toFixed(1) + ' 平滑=' + r.hatchRms.toFixed(1) + ' 卡尔曼=' + r.kfRms.toFixed(1) +
      'm 末历元=' + r.err.toFixed(0) + 'm | PLL ' + r.pll + '/6 TTFF=' + r.ttff.toFixed(0) + 'ms 细修=' + r.fineMs.toFixed(0) + 'ms');
    if (bw === 4) console.log('   明细: ' + r.detail.slice(r.detail.indexOf('码相位 RMS'), r.detail.indexOf('码相位 RMS') + 190));
  }
  console.log('控制台问题 ' + logs.length + ' 条: ' + logs.slice(0, 4).join(' | '));
  await page.screenshot({ path: 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa/250-frontbw.png', fullPage: true });
  await browser.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
