'use strict';
/* check24：冷启动面板的「接收机采样率（ADC 档）」——验证
   (1) 精度随采样率单调提高；(2) 平台宽 = c/fs 与理论下限 W/√12 如期出现；
   (3) 提高采样率的代价只落在"细修"上，TTFF 几乎不变（代价由 1023² 全码相关决定，与 fs 无关）。
   背景见 CONTRACT-v20 §21 与 winners/finesearch.js。 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const C = 299792458, F_CODE = 1.023e6;
const plateauM = spc => C / (spc * F_CODE);
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
async function runAt(fr, page, spc) {
  await fr.evaluate((v) => {
    const el = document.getElementById('gl-cold-fine');
    el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, spc);
  await idle(fr, page);   /* 控件自身触发的重跑必须等完，否则会与下面的显式 run 竞态 */
  await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const s = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, c: (x.errCurve || []).length, h: (x.hatchCurve || []).length }; });
    if (!s.r && s.c > 0 && s.h > 0) {
      await page.waitForTimeout(300);
      return await fr.evaluate(() => {
        const x = globalThis.GLAPP.panels.cold.state;
        return { spc: x.fineSpc, fineN: x.fineN, fineMs: x.fineMs, plateauM: x.finePlateauM, sigmaM: x.fineSigmaM, edge: x.fineEdge,
          chipsRms: x.chipsRms, rawRms: x.rawRms, hatchRms: x.hatchRms, kfRms: x.kfRms, err: x.err, err1: x.err1,
          pll: x.pllLocked, pass2: x.pllPass2Count || 0, ttff: x.ttff, msTrack: x.msPerTrack,
          detail: document.getElementById('gl-cold-detail').textContent };
      });
    }
    await page.waitForTimeout(400);
  }
  throw new Error('cold ADC sweep timeout at spc=' + spc);
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
  await idle(fr, page);
  ok('ADC 档控件存在且含 4/16/40 三个选项',
    await fr.evaluate(() => { const e = document.getElementById('gl-cold-fine'); return !!e && ['4', '16', '40'].every(v => !!e.querySelector('option[value="' + v + '"]')); }));

  const r4 = await runAt(fr, page, 4);
  const r16 = await runAt(fr, page, 16);
  const r40 = await runAt(fr, page, 40);
  report.states = { r4, r16, r40 };
  const row = (r) => 'ADC=' + r.spc + ' 平台=' + r.plateauM.toFixed(1) + 'm 下限=' + r.sigmaM.toFixed(1) + 'm 码相位RMS=' + r.chipsRms.toFixed(1) +
    'm 原始定位RMS=' + r.rawRms.toFixed(1) + 'm 平滑后=' + r.hatchRms.toFixed(1) + 'm 卡尔曼=' + r.kfRms.toFixed(1) + 'm TTFF=' + r.ttff.toFixed(0) +
    'ms 细修=' + r.fineMs.toFixed(0) + 'ms 跟踪=' + r.msTrack.toFixed(1) + 'ms PLL=' + r.pll + '/6';
  console.log('  [实测] ' + row(r4));
  console.log('  [实测] ' + row(r16));
  console.log('  [实测] ' + row(r40));

  ok('三档都跑完 6 颗、PLL 全锁、无峰落窗边缘', [r4, r16, r40].every(v => v.fineN === 6 && v.pll === 6 && v.edge === 0),
    [r4, r16, r40].map(v => v.fineN + '/' + v.pll + '/edge' + v.edge).join(' '));
  ok('平台宽 = c/fs（73.3/18.3/7.3 m，±2%）', [r4, r16, r40].every(v => Math.abs(v.plateauM - plateauM(v.spc)) <= 0.02 * plateauM(v.spc)),
    [r4, r16, r40].map(v => v.spc + 'spc:' + v.plateauM.toFixed(1)).join(' '));
  ok('理论下限 = 平台宽/√12（21.1/5.3/2.1 m，±2%）', [r4, r16, r40].every(v => Math.abs(v.sigmaM - v.plateauM / Math.sqrt(12)) <= 0.02 * v.plateauM / Math.sqrt(12)),
    [r4, r16, r40].map(v => v.spc + 'spc:' + v.sigmaM.toFixed(2)).join(' '));
  ok('码相位 RMS 随 ADC 档单调下降：16 ≤ 0.5×4、40 ≤ 0.6×16',
    r16.chipsRms <= 0.5 * r4.chipsRms && r40.chipsRms <= 0.6 * r16.chipsRms,
    r4.chipsRms.toFixed(1) + ' → ' + r16.chipsRms.toFixed(1) + ' → ' + r40.chipsRms.toFixed(1) + ' m');
  ok('原始定位 RMS 随 ADC 档单调下降：16 ≤ 0.6×4、40 ≤ 0.7×16',
    r16.rawRms <= 0.6 * r4.rawRms && r40.rawRms <= 0.7 * r16.rawRms,
    r4.rawRms.toFixed(1) + ' → ' + r16.rawRms.toFixed(1) + ' → ' + r40.rawRms.toFixed(1) + ' m');
  ok('40 采样/chip 档逐历元原始定位 RMS ≤ 20 m', r40.rawRms <= 20, r40.rawRms.toFixed(1) + ' m');
  ok('40 采样/chip 档载波平滑后 ≤ 12 m', r40.hatchRms <= 12, r40.hatchRms.toFixed(1) + ' m');
  ok('提高采样率几乎不动 TTFF（细修占 TTFF ≤20%）', [r4, r16, r40].every(v => v.fineMs <= 0.2 * v.ttff),
    [r4, r16, r40].map(v => (100 * v.fineMs / v.ttff).toFixed(1) + '%').join(' '));
  ok('明细文案含 ADC 档位/平台宽/理论下限', [r4, r16, r40].every(v => /采样\/chip/.test(v.detail) && /平台宽/.test(v.detail)),
    r16.detail.slice(r16.detail.indexOf('码相位 RMS'), r16.detail.indexOf('码相位 RMS') + 90));
  await page.screenshot({ path: OUT + '/240-adc-sweep.png', fullPage: true });

  const dark = await browser.newPage({ viewport: { width: 980, height: 1900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(PAGE_URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-cold');
  const dd = await runAt(dfr, dark, 16);
  ok('暗色主题下 ADC=16 同样跑完并给出合理精度', dd.pll === 6 && isFinite(dd.chipsRms) && dd.plateauM > 18 && dd.plateauM < 18.7,
    'pll=' + dd.pll + ' 码相位RMS=' + dd.chipsRms.toFixed(1) + 'm');
  await dark.screenshot({ path: OUT + '/241-dark-adc.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify({ logs: report.logs, checks: report.checks }, null, 1));
  console.log('---- check24: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
