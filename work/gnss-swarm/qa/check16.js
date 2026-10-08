'use strict';
/* check16：冷启动主流程——「首历元捕获 + 跟踪环」 vs 「每历元独立捕获 + 平均」 */
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
async function runCold(fr, page, mode, stepS) {
  await fr.evaluate(([m, s]) => {
    const md = document.getElementById('gl-cold-mode'), sp = document.getElementById('gl-cold-step');
    md.value = m; md.dispatchEvent(new Event('change', { bubbles: true }));
    sp.value = String(s); sp.dispatchEvent(new Event('input', { bubbles: true }));
    globalThis.GLAPP.panels.cold.state.errCurve = [];
  }, [mode, stepS]);
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const st = await fr.evaluate(() => {
      const s = globalThis.GLAPP.panels.cold.state;
      return { r: s.running, c: (s.errCurve || []).length, mode: s.mode, stepS: s.stepS };
    });
    if (!st.r && st.c > 0) {
      return await fr.evaluate(() => {
        const s = globalThis.GLAPP.panels.cold.state;
        const es = (s.items || []).map(i => i.chipsErrM).filter(v => isFinite(v));
        return {
          mode: s.mode, stepS: s.stepS, ttff: s.ttff, msPerTrack: s.msPerTrack, trackN: s.trackN, unlocked: s.unlocked,
          chipsRms: s.chipsRms, err: s.err, err1: s.err1,
          acqChipsRms: Math.sqrt(es.reduce((a, b) => a + b * b, 0) / Math.max(1, es.length)),
          errCurve: (s.errCurve || []).map(p => Math.round(p.err)),
          chipCurve: (s.chipCurve || []).map(p => Math.round(p.rms))
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
  ok('默认策略是"首历元捕获 + 跟踪环"', await fr.evaluate(() => document.getElementById('gl-cold-mode').value) === 'dll');

  /* 1) 跟踪态（默认 100 ms 历元间隔） */
  const d = await runCold(fr, page, 'dll', 0.1);
  report.states.dll = d;
  ok('跟踪态跑完、全程锁定', d.unlocked === 0 && d.trackN === 6 * 7, 'trackN=' + d.trackN + ' unlocked=' + d.unlocked);
  ok('TTFF 是首历元捕获的总和（> 100 ms）', d.ttff > 100, d.ttff.toFixed(0) + ' ms');
  /* 绝对毫秒数受机器负载影响；真正有意义的是"比重新捕获便宜多少倍" */
  /* check16 的返回里没有 n，用默认 6 颗（该用例不改卫星数） */
  const perSatAcq = d.ttff / 6;
  /* v20 §21 起面板默认 ADC=16 采样/chip：DLL 的相关是 O(n)，单次耗时比 4 采样/chip 档 ×4，
     倍数从 ~45× 降到 6–16×。"便宜两个数量级"只在 4 采样/chip 档成立，判据按实测放到 ≥5×。 */
  ok('单次跟踪更新比捕获便宜 ≥5×（ADC=16 实测 6–16×；4 采样/chip 约 45×）', isFinite(d.msPerTrack) && perSatAcq / d.msPerTrack >= 5,
    d.msPerTrack.toFixed(2) + ' ms，捕获 ' + perSatAcq.toFixed(0) + ' ms/颗');
  ok('跟踪态码相位 RMS < 60 m', d.chipsRms < 60, d.chipsRms.toFixed(1) + ' m');
  ok('跟踪态定位误差 < 200 m', isFinite(d.err) && d.err < 200, d.err.toFixed(0) + ' m');
  ok('误差曲线长度 = 历元数', d.errCurve.length === 8, d.errCurve.join(','));
  const lblDll = await fr.evaluate(() => document.getElementById('gl-cold-err-label').textContent);
  ok('跟踪态下误差卡片标注为「跟踪态」', /跟踪态/.test(lblDll), lblDll);
  const detailDll = await fr.evaluate(() => document.getElementById('gl-cold-detail').textContent);
  report.states.detailDll = detailDll;
  ok('明细文案给出 TTFF 与跟踪单次耗时', /TTFF/.test(detailDll) && /跟踪/.test(detailDll), detailDll.slice(0, 80));
  await page.screenshot({ path: OUT + '/160-cold-dll.png', fullPage: true });

  /* 2) 对照模式 + 100 ms 漂移：平均法应当被拖垮 */
  const a1 = await runCold(fr, page, 'avg', 0.1);
  report.states.avgDrift = a1;
  ok('平均法误差随历元变差（末历元 > 首历元）', a1.errCurve[7] > a1.errCurve[0], a1.errCurve.join(','));
  ok('平均法末历元误差 > 150 m（结构性滞后）', a1.errCurve[7] > 150, a1.errCurve[7] + ' m');
  ok('同样动态下跟踪环明显更好（≥3×）', a1.errCurve[7] / Math.max(1, d.err) >= 3,
    '平均 ' + a1.errCurve[7] + ' m vs 环路 ' + d.err.toFixed(0) + ' m');
  const lblAvg = await fr.evaluate(() => document.getElementById('gl-cold-err-label').textContent);
  ok('对照模式下误差卡片标注为「多历元平均」', /平均/.test(lblAvg), lblAvg);
  await page.screenshot({ path: OUT + '/161-cold-avg-drift.png', fullPage: true });

  /* 3) 对照模式 + 0 间隔：两者都应回到采样量化下限附近 */
  const a0 = await runCold(fr, page, 'avg', 0);
  report.states.avgStatic = a0;
  ok('间隔=0 时平均法不再劣化（末历元 < 200 m）', a0.errCurve[7] < 200, a0.errCurve.join(','));
  ok('间隔=0 时误差曲线基本平坦（末/首 < 1.5）', a0.errCurve[7] / Math.max(1, a0.errCurve[0]) < 1.5,
    a0.errCurve.join(','));
  await page.screenshot({ path: OUT + '/162-cold-avg-static.png', fullPage: true });

  const dark = await browser.newPage({ viewport: { width: 980, height: 1700 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dark, report.logs);
  await dark.goto(URL);
  const dfr = await frag(dark);
  await dark.waitForTimeout(1400);
  await dfr.click('#gl-tab-cold');
  const dstat = await runCold(dfr, dark, 'dll', 0.1);
  report.states.dark = dstat;
  ok('暗色主题下跟踪态跑完（锁定、误差有限）', dstat.unlocked === 0 && isFinite(dstat.err), JSON.stringify({ unlocked: dstat.unlocked, err: dstat.err, chipsRms: dstat.chipsRms }));
  await dark.screenshot({ path: OUT + '/163-dark-cold-dll.png', fullPage: true });
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify(report, null, 1));
  console.log('---- check16: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
