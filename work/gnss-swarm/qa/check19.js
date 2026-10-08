'use strict';
/* check19：载波相位平滑码（Hatch）面板自检 */
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
async function runHatch(fr, page, cfg) {
  await fr.evaluate(c => {
    const w = document.getElementById('gl-hatch-window'), b = document.getElementById('gl-hatch-bias'), s = document.getElementById('gl-hatch-slip');
    w.value = String(c.window); w.dispatchEvent(new Event('change', { bubbles: true }));
    b.value = String(c.bias); b.dispatchEvent(new Event('input', { bubbles: true }));
    s.checked = c.slip; s.dispatchEvent(new Event('change', { bubbles: true }));
    globalThis.GLAPP.panels.hatch.state.res = null;
  }, cfg);
  await fr.click('#gl-hatch-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const r = await fr.evaluate(() => {
      const hs = globalThis.GLAPP.panels.hatch.state.res;
      if (!hs) return null;
      const seg = hs.smoothErr.slice(150);
      const m = seg.reduce((a, b) => a + b, 0) / seg.length;
      const sd = Math.sqrt(seg.reduce((a, b) => a + (b - m) * (b - m), 0) / seg.length);
      const codeSeg = hs.codeErr.slice(150);
      const cm = codeSeg.reduce((a, b) => a + b, 0) / codeSeg.length;
      const csd = Math.sqrt(codeSeg.reduce((a, b) => a + (b - cm) * (b - cm), 0) / codeSeg.length);
      return { std: sd, mean: m, last: hs.smoothErr[hs.smoothErr.length - 1], codeStd: csd, resets: hs.resets.length, window: hs.window, bias: hs.bias };
    });
    if (r) return r;
    await page.waitForTimeout(300);
  }
  throw new Error('hatch timeout');
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
  ok('hatchSmooth 模块已加载', await fr.evaluate(() => typeof globalThis.GNSS.hatchSmooth === 'function'));
  await fr.click('#gl-tab-pll');
  await page.waitForTimeout(1200);
  ok('进入面板自动跑出结果', await fr.evaluate(() => !!(globalThis.GLAPP.panels.hatch.state.res)));
  ok('平滑画布有宽度', await fr.evaluate(() => document.getElementById('gl-hatch-canvas').clientWidth) > 200);

  /* 生长窗口 + 15 m 初始偏差（默认） */
  const g = await runHatch(fr, page, { window: 0, bias: 15, slip: false });
  report.states.growing = g;
  ok('生长窗口：稳态抖动 ≤1 m（降噪 ≥30 倍）', g.std <= 1 && g.codeStd / Math.max(0.01, g.std) >= 30,
    'std=' + g.std.toFixed(2) + ' m, 码 std=' + g.codeStd.toFixed(1) + ' m');
  ok('初始码偏差 15 m 被保留（末值误差 13–17 m）', Math.abs(g.last - 15) <= 2, g.last.toFixed(2) + ' m');
  await page.screenshot({ path: OUT + '/190-hatch-growing.png', fullPage: true });

  /* 固定窗口 N=20：噪声地板 */
  const w20 = await runHatch(fr, page, { window: 20, bias: 0, slip: false });
  report.states.win20 = w20;
  ok('固定 N=20：稳态抖动在 0.5–6 m（有限窗口地板）', w20.std >= 0.5 && w20.std <= 6, w20.std.toFixed(2) + ' m');
  ok('固定窗口比生长窗口差（≥2 倍）', w20.std >= 2 * g.std, w20.std.toFixed(2) + ' vs ' + g.std.toFixed(2));

  /* 周跳：2000 周 + 4.5σ 阈值 */
  const sl = await runHatch(fr, page, { window: 0, bias: 4, slip: true });
  report.states.slip = sl;
  ok('周跳被检出（重置 ≥1 次）', sl.resets >= 1, sl.resets + ' 次');
  ok('检测后末值误差回到码测量量级（|err| ≤45 m）', Math.abs(sl.last) <= 45, sl.last.toFixed(2) + ' m');
  await page.screenshot({ path: OUT + '/191-hatch-slip.png', fullPage: true });

  const stats = await fr.evaluate(() => ['gl-hatch-std', 'gl-hatch-last', 'gl-hatch-resets', 'gl-hatch-detail'].map(i => document.getElementById(i).textContent));
  report.states.stats = stats;
  ok('三张统计卡都有值', stats.slice(0, 3).every(t => t && t !== '—'), stats.slice(0, 3).join(' | '));
  ok('明细含窗口/偏差/周跳信息', /窗口/.test(stats[3]) && /偏差/.test(stats[3]) && /周跳/.test(stats[3]), stats[3].slice(0, 70));

  const dark = await browser.newPage({ viewport: { width: 980, height: 1700 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-pll');
  await dark.waitForTimeout(1200);
  ok('暗色主题下同样自动运行', await dfr.evaluate(() => !!(globalThis.GLAPP.panels.hatch.state.res)));
  await dark.screenshot({ path: OUT + '/192-dark-hatch.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify(report, null, 1));
  console.log('---- check19: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
