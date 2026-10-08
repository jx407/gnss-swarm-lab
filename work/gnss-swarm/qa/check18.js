'use strict';
/* check18：载波跟踪面板（Costas PLL）端到端自检 */
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
async function runPll(fr, page, cfg) {
  await fr.evaluate(c => {
    const o = document.getElementById('gl-pll-order'), d = document.getElementById('gl-pll-disc');
    const f = document.getElementById('gl-pll-fres'), c2 = document.getElementById('gl-pll-flip');
    o.value = String(c.order); o.dispatchEvent(new Event('change', { bubbles: true }));
    d.value = c.disc; d.dispatchEvent(new Event('change', { bubbles: true }));
    f.value = String(c.fRes); f.dispatchEvent(new Event('input', { bubbles: true }));
    c2.checked = c.flip; c2.dispatchEvent(new Event('change', { bubbles: true }));
    globalThis.GLAPP.panels.pll.state.res = null;
  }, cfg);
  await fr.click('#gl-pll-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const r = await fr.evaluate(() => {
      const s = globalThis.GLAPP.panels.pll.state.res;
      return s ? { locked: s.locked, errs: s.errs, freq: s.freq, disc: s.disc, discMode: s.discMode, order: s.order, flipAt: s.flipAt } : null;
    });
    if (r) return r;
    await page.waitForTimeout(300);
  }
  throw new Error('pll timeout');
}
const meanAbs = (a, from) => a.slice(from).reduce((s, v) => s + Math.abs(v), 0) / a.slice(from).length;
const mean = (a, from) => a.slice(from).reduce((s, v) => s + v, 0) / a.slice(from).length;
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], checks: [], states: {} };
  const ok = (name, cond, info) => report.checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) });
  const page = await browser.newPage({ viewport: { width: 980, height: 1500 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);
  ok('pllTrack 模块已加载', await fr.evaluate(() => typeof globalThis.GNSS.pllTrack === 'function'));
  await fr.click('#gl-tab-pll');
  await page.waitForTimeout(1200);
  const cw = await fr.evaluate(() => ({ a: document.getElementById('gl-pll-iq').clientWidth, b: document.getElementById('gl-pll-phase').clientWidth }));
  ok('两块画布有宽度', cw.a > 200 && cw.b > 200, JSON.stringify(cw));
  ok('首次进入自动运行出结果', await fr.evaluate(() => !!(globalThis.GLAPP.panels.pll.state.res)));

  /* 默认：二阶 + Costas + 2 Hz + 翻转 → 应锁定、不被翻转踢走 */
  const dft = await fr.evaluate(() => {
    const s = globalThis.GLAPP.panels.pll.state.res;
    return { locked: s.locked, lastErr: s.errs[s.errs.length - 1], meanAbsErr: s.errs.slice(20).reduce((a, b) => a + Math.abs(b), 0) / 20, discMode: s.discMode, flipAt: s.flipAt };
  });
  report.states.def = dft;
  ok('默认用 Costas 鉴相', dft.discMode === 'costas');
  ok('默认（Costas + 翻转）锁定', dft.locked === true);
  ok('默认翻转后仍贴住相位（后 20 历元平均 |误差| ≤ 0.15 rad）', dft.meanAbsErr <= 0.15, dft.meanAbsErr.toFixed(3) + ' rad');
  await page.screenshot({ path: OUT + '/180-pll-costas.png', fullPage: true });

  /* 换成 atan2：同一翻转应把它踢走 */
  const at = await runPll(fr, page, { order: 2, disc: 'atan', fRes: 2, flip: true });
  const atMean = at.errs.slice(25).reduce((a, b) => a + Math.abs(b), 0) / at.errs.slice(25).length;
  report.states.atan = { locked: at.locked, meanAbsAfter: atMean };
  ok('atan2 + 翻转：被踢走（后段平均 |误差| ≥ 1.0 rad）', atMean >= 1.0, atMean.toFixed(3) + ' rad');
  ok('atan2 + 翻转：稳态判为未锁定', at.locked === false);
  await page.screenshot({ path: OUT + '/181-pll-atan-flip.png', fullPage: true });

  /* 一阶 vs 二阶（无翻转、2 Hz 残余多普勒） */
  const one = await runPll(fr, page, { order: 1, disc: 'costas', fRes: 2, flip: false });
  const two = await runPll(fr, page, { order: 2, disc: 'costas', fRes: 2, flip: false });
  const lag1 = meanAbs(one.errs, 20), lag2 = meanAbs(two.errs, 20);
  report.states.one = { lag: lag1, freq: mean(one.freq, 20) }; report.states.two = { lag: lag2, freq: mean(two.freq, 20) };
  ok('一阶环稳态滞后 ≥ 0.25 rad（教科书 2πf·dt/α≈0.42）', lag1 >= 0.25, lag1.toFixed(3) + ' rad');
  ok('二阶环稳态滞后 ≤ 0.10 rad', lag2 <= 0.10, lag2.toFixed(3) + ' rad');
  ok('二阶环频差估计 ≈ 2 Hz（±0.6）', Math.abs(mean(two.freq, 20) - 2) <= 0.6, mean(two.freq, 20).toFixed(2) + ' Hz');
  await page.screenshot({ path: OUT + '/182-pll-second-order.png', fullPage: true });

  const stats = await fr.evaluate(() => ['gl-pll-rms', 'gl-pll-freq', 'gl-pll-lock', 'gl-pll-detail'].map(i => document.getElementById(i).textContent));
  report.states.stats = stats;
  ok('统计卡有数值（非破折号）', stats.slice(0, 3).every(t => t && t !== '—'), stats.slice(0, 3).join(' | '));
  ok('明细文案含鉴相器与环路阶数', /Costas|atan2/.test(stats[3]) && /二阶|一阶/.test(stats[3]), stats[3].slice(0, 80));

  const dark = await browser.newPage({ viewport: { width: 980, height: 1500 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-pll');
  await dark.waitForTimeout(1200);
  const dres = await dfr.evaluate(() => { const s = globalThis.GLAPP.panels.pll.state.res; return s ? { locked: s.locked } : null; });
  ok('暗色主题下同样自动运行并锁定', dres && dres.locked === true, JSON.stringify(dres));
  await dark.screenshot({ path: OUT + '/183-dark-pll.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify(report, null, 1));
  console.log('---- check18: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
