'use strict';
/* check21：冷启动链路的精度阶梯（原始码 → 载波平滑(Costas+Hatch) → 导航滤波） */
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
async function runCold(fr, page, mode, stepS, useKF) {
  await fr.evaluate(([m, s, k]) => {
    const md = document.getElementById('gl-cold-mode'), sp = document.getElementById('gl-cold-step'), kb = document.getElementById('gl-cold-kf');
    md.value = m; md.dispatchEvent(new Event('change', { bubbles: true }));
    sp.value = String(s); sp.dispatchEvent(new Event('input', { bubbles: true }));
    kb.checked = k; kb.dispatchEvent(new Event('change', { bubbles: true }));
    const st = globalThis.GLAPP.panels.cold.state;
    st.errCurve = []; st.hatchCurve = [];
  }, [mode, stepS, useKF]);
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const st = await fr.evaluate(() => {
      const s = globalThis.GLAPP.panels.cold.state;
      return { r: s.running, c: (s.errCurve || []).length, h: (s.hatchCurve || []).length };
    });
    if (!st.r && st.c > 0 && st.h > 0) {
      await page.waitForTimeout(300);
      return await fr.evaluate(() => {
        const s = globalThis.GLAPP.panels.cold.state;
        return { rawRms: s.rawRms, hatchRms: s.hatchRms, kfRms: s.kfRms, hatchErr: s.hatchErr, kfErr: s.kfErr,
          pllLocked: s.pllLocked, pllPass2Count: s.pllPass2Count, n: (s.items || []).length, hatchMs: s.hatchMs,
          maxPhaseErr: s.maxPhaseErr, lockQual: s.lastLockQual,
          errCurve: (s.errCurve || []).map(p => Math.round(p.err)),
          hatchCurve: (s.hatchCurve || []).map(p => Math.round(p.err)),
          kfCurve: (s.kfCurve || []).map(p => Math.round(p.err)),
          detail: document.getElementById('gl-cold-detail').textContent };
      });
    }
    await page.waitForTimeout(400);
  }
  throw new Error('cold ladder timeout');
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
  await page.waitForTimeout(500);
  const lad = await runCold(fr, page, 'dll', 0.1, true);
  report.states.ladder = lad;
  console.log('  [实测] 精度阶梯：原始码 ' + lad.rawRms.toFixed(1) + ' m → 载波平滑 ' + lad.hatchRms.toFixed(1) +
    ' m → 导航滤波 ' + lad.kfRms.toFixed(1) + ' m（PLL 锁定 ' + lad.pllLocked + '/6，平滑耗时 ' + (lad.hatchMs || 0).toFixed(0) + ' ms）');
  console.log('  [实测] 载波环诊断：max|相位误差|=' + (isFinite(lad.maxPhaseErr) ? lad.maxPhaseErr.toFixed(3) : 'n/a') +
    ' rad, lockQual=' + (isFinite(lad.lockQual) ? lad.lockQual.toFixed(4) : 'n/a'));
  ok('载波平滑曲线长度 = 历元数', lad.hatchCurve.length === 8, lad.hatchCurve.join(','));
  /* 实测：细块 + 两遍牵入后 6 颗里稳定锁住 5 颗；失败的那颗（G12）捕获频差只有 3.9 Hz，
     是噪声下的半周滑失（lockQual 0.853、maxErr 2.83 rad），不是频率范围问题——如实断言 ≥5 而不是 6。 */
  /* 增益调度（高增益宽牵引 + 按需第二遍）把牵入率从 5/6 提到 6/6，相位误差 ≤0.67 rad */
  ok('PLL 逐星全部牵入（6/6）', lad.pllLocked === 6, lad.pllLocked + '/6');
  ok('载波环相位误差 ≤0.8 rad（真在跟踪）', isFinite(lad.maxPhaseErr) && lad.maxPhaseErr <= 0.8,
    (isFinite(lad.maxPhaseErr) ? lad.maxPhaseErr.toFixed(3) : 'n/a') + ' rad');
  /* 6/6 必须是 pass1（atan 高增益）直接锁出来的；若靠 pass2 的 Costas 补锁，在混叠边界处可能是假锁 */
  ok('6/6 全部由 pass1 直接锁定（未依赖 Costas 补锁，避免假锁）', lad.pllPass2Count === 0, 'pass2 用了 ' + lad.pllPass2Count + ' 颗');
  ok('本次最后一颗星锁定质量 lockQual ≥ 0.95', isFinite(lad.lockQual) && lad.lockQual >= 0.95,
    (isFinite(lad.lockQual) ? lad.lockQual.toFixed(4) : 'n/a'));
  ok('逐星诊断已记录（pllStats 长度 = 星数）', await fr.evaluate(() => (globalThis.GLAPP.panels.cold.state.pllStats || []).length) === 6,
    await fr.evaluate(() => (globalThis.GLAPP.panels.cold.state.pllStats || []).length));
  ok('载波平滑显著优于原始码（≤0.7×）', lad.hatchRms <= 0.7 * lad.rawRms,
    lad.rawRms.toFixed(1) + ' → ' + lad.hatchRms.toFixed(1) + ' m');
  /* KF 吃的是**已平滑**的伪距，所以它的 RMS 提升有限（实测 25.8 → 24.0 m，约 7%）：
     断言"不劣化 + 末历元估计更准"才是诚实口径（滤波器的价值在时间平滑而非再降一次白噪声）。 */
  ok('导航滤波不劣化平滑结果（≤1.1×）', lad.kfRms <= 1.1 * lad.hatchRms,
    lad.hatchRms.toFixed(1) + ' → ' + lad.kfRms.toFixed(1) + ' m');
  ok('导航滤波让末历元估计更准（kfErr < hatchErr）', isFinite(lad.kfErr) && isFinite(lad.hatchErr) && lad.kfErr < lad.hatchErr,
    '末历元 ' + (isFinite(lad.hatchErr) ? lad.hatchErr.toFixed(1) : 'n/a') + ' → ' + (isFinite(lad.kfErr) ? lad.kfErr.toFixed(1) : 'n/a') + ' m');
  ok('整体阶梯：原始 ≥ 平滑，且滤波不劣化', lad.rawRms >= lad.hatchRms && lad.kfRms <= 1.1 * lad.hatchRms,
    lad.rawRms.toFixed(1) + ' ≥ ' + lad.hatchRms.toFixed(1) + '（滤波 ' + lad.kfRms.toFixed(1) + '）');
  ok('明细文案含"精度阶梯"与三档数字', /精度阶梯/.test(lad.detail), lad.detail.slice(-120));
  await page.screenshot({ path: OUT + '/210-ladder.png', fullPage: true });

  /* 关掉卡尔曼：平滑仍在、滤波曲线消失 */
  const noKf = await runCold(fr, page, 'dll', 0.1, false);
  report.states.noKf = { hatchRms: noKf.hatchRms, kfRms: noKf.kfRms, kfCurve: noKf.kfCurve.length };
  ok('关闭卡尔曼后仍有载波平滑、但无滤波曲线', isFinite(noKf.hatchRms) && noKf.kfCurve.length === 0,
    'hatch=' + noKf.hatchRms.toFixed(1) + ' kfCurve=' + noKf.kfCurve.length);
  await page.screenshot({ path: OUT + '/211-ladder-nokf.png', fullPage: true });

  const dark = await browser.newPage({ viewport: { width: 980, height: 1800 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(PAGE_URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-cold');
  const dlad = await runCold(dfr, dark, 'dll', 0.1, true);
  ok('暗色主题下同样跑出阶梯', dlad.hatchCurve.length === 8 && dlad.pllLocked === 6,
    'hatch=' + dlad.hatchRms.toFixed(1) + ' kf=' + dlad.kfRms.toFixed(1));
  await dark.screenshot({ path: OUT + '/212-dark-ladder.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify(report, null, 1));
  console.log('---- check21: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
