'use strict';
/* check20：定位面板的双频消电离层蒙特卡洛（三情景同批噪声） */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
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
async function runPos(fr, page, act, sigma) {
  await fr.evaluate(([a, s]) => {
    const ia = document.getElementById('gl-pos-iono-act');
    ia.value = String(a); ia.dispatchEvent(new Event('change', { bubbles: true }));
    if (s != null) { const sl = document.getElementById('gl-pos-sigma'); sl.value = String(s); sl.dispatchEvent(new Event('input', { bubbles: true })); }
    globalThis.GLAPP.panels.pos.state.ionoRes = null;
  }, [act, sigma]);
  await fr.click('#gl-pos-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const r = await fr.evaluate(() => {
      const st = globalThis.GLAPP.panels.pos.state;
      if (!st.ionoRes) return null;
      return { none: st.ionoRes.none, model: st.ionoRes.model, dual: st.ionoRes.dual, ioMax: st.ionoRes.ioMax, amp: st.ionoRes.amp, act: st.ionoRes.act,
        detail: document.getElementById('gl-pos-detail').textContent };
    });
    if (r) { await page.waitForTimeout(400); return r; }
    await page.waitForTimeout(400);
  }
  throw new Error('pos timeout');
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], checks: [], states: {} };
  const ok = (name, cond, info) => report.checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) });
  const page = await browser.newPage({ viewport: { width: 980, height: 1900 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  ok('ionoFree 模块已加载', await fr.evaluate(() => typeof globalThis.GNSS.ionoFree === 'function'));
  await fr.click('#gl-tab-pos');
  await page.waitForTimeout(1200);
  ok('电离层对比画布有宽度', await fr.evaluate(() => document.getElementById('gl-pos-iono-canvas').clientWidth) > 200);

  /* ×1 平静、σ=2 m：电离层被接收机钟差吸收掉共同模态后影响很小 */
  const calm = await runPos(fr, page, 1, 2);
  report.states.calm = calm;
  ok('三情景都有有限结果', [calm.none, calm.model, calm.dual].every(Number.isFinite),
    'none=' + calm.none.toFixed(1) + ' model=' + calm.model.toFixed(1) + ' dual=' + calm.dual.toFixed(1));
  ok('组合噪声放大 = 2.978（±0.01）', Math.abs(calm.amp - 2.978255) < 0.01, calm.amp.toFixed(4));
  ok('×1／σ=2 时模型改正与不改正差别很小（共同模态被钟差吸收）',
    Math.abs(calm.model - calm.none) <= 0.4 * calm.none, 'none=' + calm.none.toFixed(1) + ' model=' + calm.model.toFixed(1));
  ok('×1 时双频明显更差（组合噪声 2.98× 不划算：dual ≥ 2×model）', calm.dual >= 2 * calm.model,
    'dual=' + calm.dual.toFixed(1) + ' vs model=' + calm.model.toFixed(1));
  await page.screenshot({ path: OUT + '/200-iono-calm.png', fullPage: true });

  /* ×20 强扰动、σ=1 m：模型改正明显赢 */
  const storm = await runPos(fr, page, 20, 1);
  report.states.storm = storm;
  ok('×20 时不改正显著恶化（≥3× ×1 同 σ 值）', storm.none >= 3 * calm.none * (2 / 1) / 2,
    '×1(σ=2) ' + calm.none.toFixed(1) + ' → ×20(σ=1) ' + storm.none.toFixed(1) + ' m');
  ok('×20／σ=1 时模型改正明显优于不改正（≤0.5×）', storm.model <= 0.5 * storm.none,
    'model=' + storm.model.toFixed(1) + ' vs none=' + storm.none.toFixed(1));
  ok('L1 最大斜距延迟随活跃度放大（×20 时 > 10× ×1）', storm.ioMax > 10 * calm.ioMax,
    '×1 ' + calm.ioMax.toFixed(1) + ' → ×20 ' + storm.ioMax.toFixed(1) + ' m');
  await page.screenshot({ path: OUT + '/201-iono-storm.png', fullPage: true });

  /* ×20 强扰动、σ=0.5 m：低噪声接收机 → 双频反超 */
  const low = await runPos(fr, page, 20, 0.5);
  report.states.stormLowNoise = low;
  ok('×20／σ=0.5 时双频反超模型改正（低噪声才划算）', low.dual < low.model,
    'dual=' + low.dual.toFixed(1) + ' vs model=' + low.model.toFixed(1) + ' m');
  await page.screenshot({ path: OUT + '/203-iono-low-noise.png', fullPage: true });

  /* 同 σ 下双频不随活跃度变化：×1/σ=0.5 与 ×20/σ=0.5 对照 */
  const calmLow = await runPos(fr, page, 1, 0.5);
  report.states.calmLowNoise = calmLow;
  ok('同一 σ 下双频误差与活跃度无关（×1 vs ×20 相差 ≤15%）',
    Math.abs(calmLow.dual - low.dual) <= 0.15 * Math.max(1, low.dual),
    '×1 ' + calmLow.dual.toFixed(2) + ' vs ×20 ' + low.dual.toFixed(2) + ' m');

  const dark = await browser.newPage({ viewport: { width: 980, height: 1900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-pos');
  await dark.waitForTimeout(1200);
  const dres = await runPos(dfr, dark, 20, 2);
  ok('暗色主题下三情景同样算出', [dres.none, dres.model, dres.dual].every(Number.isFinite));
  await dark.screenshot({ path: OUT + '/202-dark-iono.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify(report, null, 1));
  console.log('---- check20: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
