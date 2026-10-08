'use strict';
/* check25：冷启动面板的「前端带宽（IF 滤波）」——带限模型与分数延迟复制码的端到端判据
 * 背景见 CONTRACT-v21 §22：平台有"信号侧硬采样"与"复制码整数样本量化"两个来源；
 * 真实接收机两者都不成立，所以带限档下峰顶是光滑丘、插值才真的起作用。 */
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
async function runAt(fr, page, bw) {
  await fr.evaluate((v) => {
    const s = document.getElementById('gl-cold-fine'); s.value = '16'; s.dispatchEvent(new Event('change', { bubbles: true }));
    const f = document.getElementById('gl-cold-frontbw'); f.value = String(v); f.dispatchEvent(new Event('change', { bubbles: true }));
  }, bw);
  for (let i = 0; i < 300; i++) { if (!(await fr.evaluate(() => globalThis.GLAPP.panels.cold.state.running))) break; await page.waitForTimeout(300); }
  await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const st = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, c: (x.errCurve || []).length, h: (x.hatchCurve || []).length }; });
    if (!st.r && st.c > 0 && st.h > 0) {
      await page.waitForTimeout(300);
      return await fr.evaluate(() => {
        const x = globalThis.GLAPP.panels.cold.state;
        return { bw: x.frontBw, spc: x.fineSpc, n: x.fineN, smooth: x.fineSmooth, est: x.fineEstimator, weak: x.fineWeak,
          plateauM: x.finePlateauM, sigmaM: x.fineSigmaM, e0: x.fineN0 ? Math.sqrt(x.fineErr0Sum / x.fineN0) : NaN,
          chipsRms: x.chipsRms, rawRms: x.rawRms, hatchRms: x.hatchRms, kfRms: x.kfRms, err: x.err, err1: x.err1,
          pll: x.pllLocked, ttff: x.ttff, fineMs: x.fineMs, detail: document.getElementById('gl-cold-detail').textContent };
      });
    }
    await page.waitForTimeout(400);
  }
  throw new Error('cold frontbw timeout bw=' + bw);
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], checks: [] };
  const ok = (name, cond, info) => report.checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) });
  const page = await browser.newPage({ viewport: { width: 980, height: 1900 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(PAGE_URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  await fr.click('#gl-tab-cold');
  await page.waitForTimeout(500);
  ok('前端带宽控件存在（理想/8/4/2 MHz 四档）',
    await fr.evaluate(() => { const e = document.getElementById('gl-cold-frontbw'); return !!e && ['0', '8', '4', '2'].every(v => !!e.querySelector('option[value="' + v + '"]')); }));

  const r0 = await runAt(fr, page, 0);
  const r8 = await runAt(fr, page, 8);
  const r4 = await runAt(fr, page, 4);
  const r2 = await runAt(fr, page, 2);
  report.states = { r0, r8, r4, r2 };
  for (const r of [r0, r8, r4, r2]) {
    console.log('  [实测] 前端=' + (r.bw === 0 ? '理想方波' : r.bw + 'MHz') + ' 光滑丘 ' + r.smooth + '/' + r.n + ' 估计器=' + r.est +
      ' 首历元精修RMS=' + r.e0.toFixed(2) + 'm 链路码相位RMS=' + r.chipsRms.toFixed(1) + 'm 原始定位RMS=' + r.rawRms.toFixed(1) +
      'm 平滑=' + r.hatchRms.toFixed(1) + 'm 卡尔曼=' + r.kfRms.toFixed(1) + 'm PLL=' + r.pll + '/6 TTFF=' + r.ttff.toFixed(0) + 'ms 细修=' + r.fineMs.toFixed(0) + 'ms');
  }
  ok('四档都跑完 6 颗、PLL 全锁、幅度门未触发', [r0, r8, r4, r2].every(v => v.n === 6 && v.pll === 6 && v.weak === 0),
    [r0, r8, r4, r2].map(v => v.n + '/' + v.pll + '/w' + v.weak).join(' '));
  ok('理想方波档判为平台（光滑丘 0/6、估计器 centroid）——旧行为回归保护',
    r0.smooth === 0 && r0.est === 'centroid' && Math.abs(r0.chipsRms - 11.4) < 4, r0.est + ' ' + r0.chipsRms.toFixed(1) + 'm');
  ok('三档带限都判为光滑丘（6/6、估计器 parab-fine）',
    [r8, r4, r2].every(v => v.smooth === 6 && v.est === 'parab-fine'), [r8, r4, r2].map(v => v.smooth + '/' + v.est).join(' '));
  /* 3 dB 带宽常数改正后（见 CONTRACT-v21 §1 的勘误），同标签的 σ 小 2.83 倍、平滑更温和：
     实测首历元 理想 6.35 → 8MHz 4.74 / 4MHz 2.53 / 2MHz 2.67 m。判据用"最优带限档"。 */
  ok('首历元精修 RMS：最优带限档 ≤0.6× 理想方波档',
    Math.min(r8.e0, r4.e0, r2.e0) <= 0.6 * r0.e0,
    '理想 ' + r0.e0.toFixed(2) + 'm → 8MHz ' + r8.e0.toFixed(2) + ' / 4MHz ' + r4.e0.toFixed(2) + ' / 2MHz ' + r2.e0.toFixed(2) + 'm');
  ok('链路码相位 RMS：带限最优档 ≤0.55× 理想方波档（DLL 也吃到分数延迟复制码）',
    Math.min(r8.chipsRms, r4.chipsRms, r2.chipsRms) <= 0.55 * r0.chipsRms,
    '理想 ' + r0.chipsRms.toFixed(1) + 'm → 最优 ' + Math.min(r8.chipsRms, r4.chipsRms, r2.chipsRms).toFixed(1) + 'm');
  ok('原始定位 RMS：带限最优档 ≤0.85× 理想方波档',
    Math.min(r8.rawRms, r4.rawRms, r2.rawRms) <= 0.85 * r0.rawRms,
    '理想 ' + r0.rawRms.toFixed(1) + 'm → 最优 ' + Math.min(r8.rawRms, r4.rawRms, r2.rawRms).toFixed(1) + 'm');
  /* 常数改正后结论方向也变了：16 采样/chip（奈奎斯特 8.18 MHz）下 8 MHz 前端反而**不是**最优，
     4/2 MHz 更好 —— 与 tests/test-bandlimit.js 的 −20 dB 扫参一致（最优点 ≈ f_s/4）。 */
  ok('不是"越宽越好"：8 MHz 档明显差于最优带限档（≥1.2×）',
    r8.chipsRms >= 1.2 * Math.min(r4.chipsRms, r2.chipsRms),
    '8MHz ' + r8.chipsRms.toFixed(1) + 'm vs 4/2MHz ' + Math.min(r4.chipsRms, r2.chipsRms).toFixed(1) + 'm');
  ok('明细文案写明前端模型与估计器', /前端/.test(r4.detail) && /光滑丘/.test(r4.detail) && /parab-fine|centroid/.test(r4.detail),
    r4.detail.slice(r4.detail.indexOf('前端'), r4.detail.indexOf('前端') + 60));
  await page.screenshot({ path: OUT + '/250-frontbw.png', fullPage: true });

  const dark = await browser.newPage({ viewport: { width: 980, height: 1900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(PAGE_URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-cold');
  const dd = await runAt(dfr, dark, 4);
  ok('暗色主题下带限档同样跑完且精度更好', dd.pll === 6 && dd.smooth === 6 && dd.e0 <= 0.7 * r0.e0,
    'pll=' + dd.pll + ' 首历元 ' + dd.e0.toFixed(2) + 'm');
  await dark.screenshot({ path: OUT + '/251-dark-frontbw.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify({ logs: report.logs, checks: report.checks }, null, 1));
  console.log('---- check25: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
