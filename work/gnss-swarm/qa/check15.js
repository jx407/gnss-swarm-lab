'use strict';
/* check15：跟踪环 vs 快照平均对比面板（GNSS.trackDll 上线后的端到端自检） */
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
async function runDll(fr, page, slope) {
  await fr.evaluate(v => {
    const sl = document.getElementById('gl-dll-slope');
    sl.value = String(v); sl.dispatchEvent(new Event('input', { bubbles: true }));
    globalThis.GLAPP.panels.dll.state.data = null;
  }, slope);
  await fr.click('#gl-dll-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const d = await fr.evaluate(() => globalThis.GLAPP.panels.dll.state.data);
    if (d) return d;
    await page.waitForTimeout(400);
  }
  return null;
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], checks: [], states: {} };
  const ok = (name, cond, info) => report.checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) });
  const page = await browser.newPage({ viewport: { width: 980, height: 1600 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  await fr.click('#gl-tab-cold');
  await page.waitForTimeout(500);
  ok('面板已注册', await fr.evaluate(() => !!(globalThis.GLAPP.panels.dll && globalThis.GLAPP.panels.dll.state)));
  ok('trackDll 模块已加载', await fr.evaluate(() => typeof globalThis.GNSS.trackDll === 'function'));
  const cvw = await fr.evaluate(() => document.getElementById('gl-dll-canvas').clientWidth);
  ok('画布可见且有宽度', cvw > 200, cvw);
  const dyn = await runDll(fr, page, 0.27);
  report.states.dyn = dyn && { avgMean: dyn.avgMean, loopMean: dyn.loopMean, avgLast: dyn.avgLast, loopLast: dyn.loopLast, locked: dyn.locked, slope: dyn.slope };
  ok('动态场景跑完并锁定', dyn && dyn.locked === true);
  ok('快照平均在动态下显著劣化（后 10 历元均值 > 200 m）', dyn && dyn.avgMean > 200, dyn && dyn.avgMean.toFixed(0));
  ok('跟踪环在动态下仍精确（后 10 历元均值 < 80 m）', dyn && dyn.loopMean < 80, dyn && dyn.loopMean.toFixed(0));
  ok('环路比快照平均好 ≥ 3 倍', dyn && dyn.avgMean / Math.max(1, dyn.loopMean) >= 3, dyn && (dyn.avgMean / Math.max(1, dyn.loopMean)).toFixed(1));
  await page.screenshot({ path: OUT + '/150-dll-dyn.png', fullPage: true });

  const stat = await runDll(fr, page, 0);
  report.states.stat = stat && { avgMean: stat.avgMean, loopMean: stat.loopMean, locked: stat.locked };
  ok('漂移=0 时快照平均也回到量化下限附近（< 80 m）', stat && stat.avgMean < 80, stat && stat.avgMean.toFixed(0));
  ok('漂移=0 时环路同样在量化下限附近（< 80 m）', stat && stat.loopMean < 80, stat && stat.loopMean.toFixed(0));
  ok('漂移=0 时环路 locked', stat && stat.locked === true);
  await page.screenshot({ path: OUT + '/151-dll-static.png', fullPage: true });

  const note = await fr.evaluate(() => document.getElementById('gl-dll-note').textContent);
  ok('说明文字给出两种策略的实测数字', /快照平均/.test(note) && /跟踪环/.test(note) && /locked=/.test(note), note.slice(0, 60));
  const dark = await browser.newPage({ viewport: { width: 980, height: 1600 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-cold');
  const dstat = await runDll(dfr, dark, 0.27);
  ok('暗色主题下同样能跑完', dstat && dstat.locked === true);
  await dark.screenshot({ path: OUT + '/152-dark-dll.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify(report, null, 1));
  console.log('---- check15: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
