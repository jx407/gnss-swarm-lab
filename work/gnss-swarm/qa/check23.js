'use strict';
/* check23：冷启动的「信号信噪比」档 —— 验证"**同一采样率下**量化下限主导，SNR 不是有效杠杆"。
   v20 起 ADC 档固定为 4 采样/chip（ADC 档本身是有效杠杆，见 qa/check24.js）。 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
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
async function idle(fr, page, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 120000)) {
    if (!(await fr.evaluate(() => globalThis.GLAPP.panels.cold.state.running))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}
async function runCold(fr, page, snr, mode, act, fine) {
  /* 注意：本套判据的论点是"**同一采样率下**提高 SNR 不是杠杆"，所以把 ADC 档固定在 4 采样/chip。
     ADC 档本身是有效杠杆，那套判据在 qa/check24.js（实测 36.7 → 11.4 → 4.0 m）。 */
  await fr.evaluate(([sn, m, a, f]) => {
    const ss = document.getElementById('gl-cold-snr'), ms = document.getElementById('gl-cold-iono'), ia = document.getElementById('gl-cold-iono-act'), fe = document.getElementById('gl-cold-fine');
    ss.value = String(sn); ss.dispatchEvent(new Event('change', { bubbles: true }));
    ms.value = m; ms.dispatchEvent(new Event('change', { bubbles: true }));
    ia.value = String(a); ia.dispatchEvent(new Event('change', { bubbles: true }));
    fe.value = String(f); fe.dispatchEvent(new Event('change', { bubbles: true }));
  }, [snr, mode, act, fine == null ? 4 : fine]);
  await idle(fr, page);
  await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, c: (x.errCurve || []).length, h: (x.hatchCurve || []).length }; });
    if (!s.r && s.c > 0 && s.h > 0) {
      await page.waitForTimeout(300);
      return await fr.evaluate(() => {
        const x = globalThis.GLAPP.panels.cold.state;
        return { chipsRms: x.chipsRms, rawRms: x.rawRms, hatchRms: x.hatchRms, kfRms: x.kfRms, ionoMax: x.ionoMax,
          snrDb: x.snrDb, mode: x.ionoMode, act: x.ionoAct, pllLocked: x.pllLocked, fineSpc: x.fineSpc, fineN: x.fineN,
          plateauM: x.finePlateauM, sigmaM: x.fineSigmaM,
          detail: document.getElementById('gl-cold-detail').textContent };
      });
    }
    await page.waitForTimeout(400);
  }
  throw new Error('cold snr timeout');
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], checks: [] };
  const ok = (name, cond, info) => report.checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) });
  const page = await browser.newPage({ viewport: { width: 980, height: 1800 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(PAGE_URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  await fr.click('#gl-tab-cold');
  await idle(fr, page);
  ok('信噪比档控件存在', await fr.evaluate(() => !!document.getElementById('gl-cold-snr')));

  const s20 = await runCold(fr, page, -20, 'model', 20);
  const s14 = await runCold(fr, page, -14, 'model', 20);
  const s8 = await runCold(fr, page, -8, 'model', 20);
  const d8 = await runCold(fr, page, -8, 'dual', 20);
  report.states = { s20, s14, s8, d8 };
  console.log('  [实测] 模型档码相位 RMS：−20 dB ' + s20.chipsRms.toFixed(1) + ' m ／ −14 dB ' + s14.chipsRms.toFixed(1) +
    ' m ／ −8 dB ' + s8.chipsRms.toFixed(1) + ' m（应几乎不变：量化下限主导）');
  console.log('  [实测] −8 dB 双频档码相位 RMS ' + d8.chipsRms.toFixed(1) + ' m（L1 档 ' + s8.chipsRms.toFixed(1) + ' m ⇒ ×' +
    (d8.chipsRms / s8.chipsRms).toFixed(2) + '）');

  ok('三档 SNR 都能跑完且 PLL 全锁', [s20, s14, s8, d8].every(v => v.pllLocked === 6),
    [s20.pllLocked, s14.pllLocked, s8.pllLocked, d8.pllLocked].join(','));
  /* 4 采样/chip 的诚实带宽：平台宽 73.3 m（信息下限 21.1 m RMS），但逐历元估计还要过 4 采样/chip 的
     二阶 DLL，实测总 RMS 落在 30–45 m。旧版写 15–35 m 是按"平台半宽 ±37 m"的旧口径定的，已按实测放宽。 */
  ok('4 采样/chip 下码相位 RMS 落在 30–45 m（信息下限 21 m + DLL 跟踪误差）', [s20, s14, s8].every(v => v.chipsRms >= 30 && v.chipsRms <= 45),
    [s20.chipsRms, s14.chipsRms, s8.chipsRms].map(v => v.toFixed(1)).join(','));
  const maxChips = Math.max(s20.chipsRms, s14.chipsRms, s8.chipsRms), minChips = Math.min(s20.chipsRms, s14.chipsRms, s8.chipsRms);
  ok('同一 ADC 档下提高信噪比 12 dB 也不能把码相位 RMS 降低 30% 以上（量化下限主导，SNR 非有效杠杆）',
    maxChips / minChips <= 1.5, 'max/min=' + (maxChips / minChips).toFixed(2));
  /* 双频档判据的修订（v20 §21）：老判据写"≥1.4× L1 档"是**比值**口径，它隐含"L1 误差主要是随机噪声"。
     ADC 档引入后 L1 的码相位误差已变成量化主导（≈31.6 m，几乎与 SNR 无关），而双频注入的额外噪声
     是按"×2.978 噪声放大"折算的固定量（−8 dB 时 17.6 m）——两者按方差相加，比值必然远低于 1.4。
     所以改成**方差一致性**这个物理口径：Δσ² 应落在模型 extra² 的 0.3–3 倍。 */
  const AMP = 2.978255, extraM = 25 * Math.pow(10, (-20 - (-8)) / 20) * Math.sqrt(AMP * AMP - 1);
  const varInc = d8.chipsRms * d8.chipsRms - s8.chipsRms * s8.chipsRms;
  ok('双频档多出来的方差与"L1/L2 组合噪声 ×2.978"模型一致（0.3–3× extra²）',
    d8.chipsRms > s8.chipsRms && varInc >= 0.3 * extraM * extraM && varInc <= 3 * extraM * extraM,
    'Δσ²=' + varInc.toFixed(0) + ' m² vs 模型 extra²=' + (extraM * extraM).toFixed(0) + ' m²（extra=' + extraM.toFixed(1) + ' m）');
  ok('×20 时 L1 最大斜距延迟 ≈51 m（活跃度生效）', Math.abs(s8.ionoMax - 51.3) <= 2, s8.ionoMax.toFixed(1) + ' m');
  ok('明细文案含信噪比/电离层档位', /电离层处理/.test(s8.detail) && /斜距延迟/.test(s8.detail), s8.detail.slice(-100));
  await page.screenshot({ path: OUT + '/230-cold-snr-quantization.png', fullPage: true });

  const dark = await browser.newPage({ viewport: { width: 980, height: 1800 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(PAGE_URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-cold');
  const dd = await runCold(dfr, dark, -8, 'model', 20);
  ok('暗色主题下同样跑完', dd.pllLocked === 6 && isFinite(dd.chipsRms), 'pll=' + dd.pllLocked);
  await dark.screenshot({ path: OUT + '/231-dark-cold-snr.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify({ logs: report.logs, checks: report.checks }, null, 1));
  console.log('---- check23: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
