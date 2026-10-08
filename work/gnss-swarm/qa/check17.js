'use strict';
/* check17：冷启动面板里的 8 维卡尔曼滤波（GNSS.navFilter 上线后的端到端自检） */
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
async function runCold(fr, page, mode, stepS, useKF) {
  await fr.evaluate(([m, s, k]) => {
    const md = document.getElementById('gl-cold-mode'), sp = document.getElementById('gl-cold-step'), kb = document.getElementById('gl-cold-kf');
    md.value = m; md.dispatchEvent(new Event('change', { bubbles: true }));
    sp.value = String(s); sp.dispatchEvent(new Event('input', { bubbles: true }));
    kb.checked = k; kb.dispatchEvent(new Event('change', { bubbles: true }));
    globalThis.GLAPP.panels.cold.state.errCurve = [];
  }, [mode, stepS, useKF]);
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await fr.evaluate(() => {
      const st = globalThis.GLAPP.panels.cold.state;
      return { r: st.running, c: (st.errCurve || []).length };
    });
    if (!s.r && s.c > 0) {
      return await fr.evaluate(() => {
        const st = globalThis.GLAPP.panels.cold.state;
        const rms = a => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length));
        return {
          mode: st.mode, stepS: st.stepS, useKF: st.useKF,
          rawRms: st.rawRms, kfRms: st.kfRms, kfErr: st.kfErr, err: st.err,
          errCurve: (st.errCurve || []).map(p => Math.round(p.err)),
          kfCurve: (st.kfCurve || []).map(p => Math.round(p.err)),
          kfCurveRms: rms((st.kfCurve || []).map(p => p.err).filter(isFinite)),
          detail: document.getElementById('gl-cold-detail').textContent
        };
      });
    }
    await page.waitForTimeout(400);
  }
  throw new Error('cold start timeout');
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], checks: [], states: {} };
  const ok = (name, cond, info) => report.checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) });
  const page = await browser.newPage({ viewport: { width: 980, height: 1700 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  await fr.click('#gl-tab-cold');
  await page.waitForTimeout(400);
  ok('navFilter 模块已加载', await fr.evaluate(() => typeof globalThis.GNSS.navFilter === 'function'));
  ok('复选框默认勾选', await fr.evaluate(() => document.getElementById('gl-cold-kf').checked === true));

  const d = await runCold(fr, page, 'dll', 0.1, true);
  report.states.dllKF = d;
  ok('卡尔曼曲线长度 = 历元数', d.kfCurve.length === 8, d.kfCurve.join(','));
  ok('卡尔曼曲线全为有限值', d.kfCurve.every(Number.isFinite), d.kfCurve.join(','));
  ok('跟踪态：卡尔曼改善逐历元 RMS（kfRms < rawRms）', d.kfRms < d.rawRms,
    d.rawRms.toFixed(1) + ' → ' + d.kfRms.toFixed(1) + ' m');
  ok('跟踪态：卡尔曼 RMS < 60 m', d.kfRms < 60, d.kfRms.toFixed(1) + ' m');
  ok('明细文案含卡尔曼数字与精度阶梯', /卡尔曼/.test(d.detail) && /精度阶梯/.test(d.detail), d.detail.slice(-90));
  await page.screenshot({ path: OUT + '/170-cold-kalman.png', fullPage: true });

  const off = await runCold(fr, page, 'dll', 0.1, false);
  report.states.dllNoKF = off;
  ok('取消勾选后不再输出卡尔曼曲线', off.kfCurve.length === 0 && off.useKF === false, 'len=' + off.kfCurve.length);

  const a = await runCold(fr, page, 'avg', 0.1, true);
  report.states.avgKF = a;
  ok('对照模式下卡尔曼曲线仍有限（不因平均法滞后而发散）', a.kfCurve.length === 8 && a.kfCurve.every(Number.isFinite), a.kfCurve.join(','));
  await page.screenshot({ path: OUT + '/171-cold-avg-kalman.png', fullPage: true });

  const dark = await browser.newPage({ viewport: { width: 980, height: 1700 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-cold');
  const dstat = await runCold(dfr, dark, 'dll', 0.1, true);
  report.states.dark = dstat && { kfRms: dstat.kfRms, rawRms: dstat.rawRms, kfCurve: dstat.kfCurve };
  ok('暗色主题下卡尔曼同样生效', dstat && dstat.kfRms < dstat.rawRms, dstat && (dstat.rawRms.toFixed(1) + ' → ' + dstat.kfRms.toFixed(1)));
  await dark.screenshot({ path: OUT + '/172-dark-kalman.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify(report, null, 1));
  console.log('---- check17: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
