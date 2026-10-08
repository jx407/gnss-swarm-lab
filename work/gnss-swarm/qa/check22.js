'use strict';
/* check22：冷启动链路的电离层三情景（不改正 / 模型改正 / 双频消电离层） */
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
async function runCold(fr, page, mode, act) {
  await fr.evaluate(([m, a]) => {
    const ms = document.getElementById('gl-cold-iono'), ia = document.getElementById('gl-cold-iono-act');
    ms.value = m; ms.dispatchEvent(new Event('change', { bubbles: true }));
    ia.value = String(a); ia.dispatchEvent(new Event('change', { bubbles: true }));
    const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = [];
  }, [mode, act]);
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, c: (x.errCurve || []).length, h: (x.hatchCurve || []).length }; });
    if (!s.r && s.c > 0 && s.h > 0) {
      await page.waitForTimeout(300);
      return await fr.evaluate(() => {
        const x = globalThis.GLAPP.panels.cold.state;
        return { rawRms: x.rawRms, hatchRms: x.hatchRms, kfRms: x.kfRms, err1: x.err1, err: x.err, ionoMax: x.ionoMax,
          mode: x.ionoMode, act: x.ionoAct, pllLocked: x.pllLocked, chipsRms: x.chipsRms,
          detail: document.getElementById('gl-cold-detail').textContent };
      });
    }
    await page.waitForTimeout(400);
  }
  throw new Error('cold iono timeout');
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], checks: [], states: {} };
  const ok = (name, cond, info) => report.checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) });
  const page = await browser.newPage({ viewport: { width: 980, height: 1800 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(PAGE_URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  await fr.click('#gl-tab-cold');
  await page.waitForTimeout(400);
  ok('电离层档位控件存在', await fr.evaluate(() => !!document.getElementById('gl-cold-iono') && !!document.getElementById('gl-cold-iono-act')));

  const calm = await runCold(fr, page, 'model', 1);
  const storm = await runCold(fr, page, 'model', 20);
  const dual1 = await runCold(fr, page, 'dual', 1);
  const dual20 = await runCold(fr, page, 'dual', 20);
  const none20 = await runCold(fr, page, 'none', 20);
  report.states = { calm, storm, dual1, dual20, none20 };
  console.log('  [实测] 模型改正 ×1：L1 最大斜距延迟 ' + calm.ionoMax.toFixed(1) + ' m，逐历元 RMS ' + calm.rawRms.toFixed(1) + ' m');
  console.log('  [实测] 模型改正 ×20：延迟 ' + storm.ionoMax.toFixed(1) + ' m，逐历元 RMS ' + storm.rawRms.toFixed(1) + ' m');
  console.log('  [实测] 双频 ×1/×20：RMS ' + dual1.rawRms.toFixed(1) + ' / ' + dual20.rawRms.toFixed(1) + ' m（应完全相同：电离层已消掉）');
  console.log('  [实测] 不改正 ×20：延迟 ' + none20.ionoMax.toFixed(1) + ' m，RMS ' + none20.rawRms.toFixed(1) + ' m');

  ok('三档都跑完且 PLL 全锁（6/6）', [calm, storm, dual1, dual20, none20].every(v => v.pllLocked === 6),
    [calm.pllLocked, storm.pllLocked, dual1.pllLocked, dual20.pllLocked].join(','));
  ok('活跃度 ×20 的 L1 斜距延迟显著放大（≥5× ×1）', storm.ionoMax >= 5 * calm.ionoMax,
    calm.ionoMax.toFixed(1) + ' → ' + storm.ionoMax.toFixed(1) + ' m');
  ok('双频档对活跃度完全不敏感（×1 与 ×20 逐历元 RMS 相同，±0.01 m）',
    Math.abs(dual1.rawRms - dual20.rawRms) <= 0.01, dual1.rawRms.toFixed(3) + ' vs ' + dual20.rawRms.toFixed(3));
  ok('双频的噪声代价体现出来（逐历元 RMS ≥2.5× 模型档，理论 2.978×）',
    dual1.rawRms >= 2.5 * calm.rawRms, (dual1.rawRms / calm.rawRms).toFixed(2) + '×');
  ok('明细文案含电离层档位与延迟量级', /电离层处理/.test(calm.detail) && /斜距延迟/.test(calm.detail), calm.detail.slice(-110));
  ok('模型改正档在 ×1 下与不改正差异被码噪声淹没（两者同量级）',
    Math.abs(calm.rawRms - none20.rawRms) <= 0.6 * none20.rawRms,
    'model(×1) ' + calm.rawRms.toFixed(1) + ' vs none(×20) ' + none20.rawRms.toFixed(1));
  await page.screenshot({ path: OUT + '/220-cold-iono-dual.png', fullPage: true });

  const dark = await browser.newPage({ viewport: { width: 980, height: 1800 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(PAGE_URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-cold');
  const d = await runCold(dfr, dark, 'dual', 20);
  ok('暗色主题下同样跑完（双频档）', d.pllLocked === 6 && isFinite(d.rawRms), 'pll=' + d.pllLocked);
  await dark.screenshot({ path: OUT + '/221-dark-cold-iono.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify({ logs: report.logs, checks: report.checks }, null, 1));
  console.log('---- check22: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
