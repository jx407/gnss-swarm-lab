'use strict';
/* 扫：信噪比 × 电离层三档（×20）。修正竞态：先设控件（会各自触发重跑）→ 等空闲 → 清曲线 → 再点一次 run。 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
async function idle(fr, page, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 120000)) {
    const r = await fr.evaluate(() => globalThis.GLAPP.panels.cold.state.running);
    if (!r) return true;
    await page.waitForTimeout(400);
  }
  return false;
}
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1500 } });
  await p.goto(PAGE_URL); await p.waitForTimeout(1500);
  let fr = null;
  for (const f of p.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) fr = f; } catch (e) { } }
  await fr.click('#gl-tab-cold');
  await idle(fr, p);
  for (const snr of [-20, -14, -8]) {
    for (const mode of ['none', 'model', 'dual']) {
      await fr.evaluate(([sn, m]) => {
        const ss = document.getElementById('gl-cold-snr'), ms = document.getElementById('gl-cold-iono'), ia = document.getElementById('gl-cold-iono-act');
        ss.value = String(sn); ss.dispatchEvent(new Event('change', { bubbles: true }));
        ms.value = m; ms.dispatchEvent(new Event('change', { bubbles: true }));
        ia.value = '20'; ia.dispatchEvent(new Event('change', { bubbles: true }));
      }, [snr, mode]);
      await idle(fr, p);                                   /* 等这三个 change 触发的重跑全部结束 */
      await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
      await fr.click('#gl-cold-run');
      const t0 = Date.now();
      while (Date.now() - t0 < 180000) {
        const s = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, c: (x.errCurve || []).length, h: (x.hatchCurve || []).length }; });
        if (!s.r && s.c > 0 && s.h > 0) break;
        await p.waitForTimeout(400);
      }
      const v = await fr.evaluate(() => {
        const s = globalThis.GLAPP.panels.cold.state;
        return { err1: s.err1, err: s.err, raw: s.rawRms, hatch: s.hatchRms, kf: s.kfRms, chips: s.chipsRms,
          io: s.ionoMax, mode: s.ionoMode, act: s.ionoAct, snr: s.snrDb, pll: s.pllLocked, p2: s.pllPass2Count };
      });
      console.log('SNR ' + String(v.snr).padStart(3) + ' dB / ×' + v.act + ' / ' + mode.padEnd(5) +
        ' → 码相位 RMS ' + (isFinite(v.chips) ? v.chips.toFixed(1) : 'n/a').padStart(5) + ' m, 逐历元定位 RMS ' +
        (isFinite(v.raw) ? v.raw.toFixed(1) : 'n/a').padStart(5) + ' m, 末历元 ' + (isFinite(v.err) ? v.err.toFixed(1) : 'n/a').padStart(5) +
        ' m, 平滑后 ' + (isFinite(v.hatch) ? v.hatch.toFixed(1) : 'n/a').padStart(5) + ' m, 滤波后 ' + (isFinite(v.kf) ? v.kf.toFixed(1) : 'n/a').padStart(5) +
        ' m (L1 max ' + (isFinite(v.io) ? v.io.toFixed(1) : 'n/a') + ' m, PLL ' + v.pll + '/6)');
    }
  }
  await b.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(1); });
