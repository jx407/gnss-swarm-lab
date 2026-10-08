'use strict';
/* check14：真实星座开关 + 码相位精修（约定修复）+ 主题/窄屏 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa';
const URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const read = (fr, ids) => fr.evaluate(list => { const o = {}; for (const i of list) { const e = document.getElementById(i); o[i] = e ? (e.value != null && e.tagName === 'SELECT' ? e.value : e.textContent) : 'MISSING'; } return o; }, ids);
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
async function coldRun(fr, page) {
  await fr.click('#gl-tab-cold');
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const s = await fr.evaluate(() => ({ r: globalThis.GLAPP.panels.cold.state.running, c: (globalThis.GLAPP.panels.cold.state.errCurve || []).length }));
    if (!s.r && s.c > 0) return true;
    await page.waitForTimeout(400);
  }
  return false;
}
(async () => {
  const browser = await chromium.launch();
  const report = { logs: [], checks: [], states: {} };
  const ok = (name, cond, info) => { report.checks.push({ name, pass: !!cond, info: info == null ? '' : String(info) }); };
  const page = await browser.newPage({ viewport: { width: 980, height: 1500 }, deviceScaleFactor: 2, colorScheme: 'light' });
  attach(page, report.logs);
  await page.goto(URL);
  const fr = await frag(page);
  await page.waitForTimeout(1500);

  /* 合成模式基线 */
  const syn = await read(fr, ['gl-sky-n', 'gl-sky-pdop', 'gl-const-note']);
  report.states.syn = syn;
  ok('合成模式可见星 6–12', +syn['gl-sky-n'] >= 6 && +syn['gl-sky-n'] <= 12, syn['gl-sky-n']);
  ok('合成模式 PDOP ≤ 5', +syn['gl-sky-pdop'] <= 5, syn['gl-sky-pdop']);
  ok('合成模式说明提到 Walker', /Walker/.test(syn['gl-const-note']), syn['gl-const-note'].slice(0, 40));

  /* 切到真实星座 */
  await fr.selectOption('#gl-const-src', 'real');
  await page.waitForTimeout(900);
  const real = await read(fr, ['gl-sky-n', 'gl-sky-pdop', 'gl-const-note']);
  report.states.real = real;
  const sysDisabled = await fr.evaluate(() => document.getElementById('gl-sys').disabled);
  ok('真实模式可见星 8–13 颗', +real['gl-sky-n'] >= 8 && +real['gl-sky-n'] <= 13, real['gl-sky-n']);
  ok('真实模式 PDOP ≤ 4', +real['gl-sky-pdop'] <= 4, real['gl-sky-pdop']);
  ok('真实模式禁用系统叠加', sysDisabled === true, sysDisabled);
  ok('说明含数据来源 CelesTrak', /CelesTrak/.test(real['gl-const-note']));
  ok('说明含误差量级（151 km / 4.2 km）', /151 km/.test(real['gl-const-note']) && /4\.2 km/.test(real['gl-const-note']));
  ok('说明含参考时刻 T0', /2026-10-05T22:32:31(\.\d+)?Z/.test(real['gl-const-note']));
  await page.screenshot({ path: OUT + '/140-real-const.png', fullPage: true });
  /* 真实模式下的时间滑块：t0+6h 仍应可见 ≥6 颗 */
  await fr.evaluate(() => { const el = document.getElementById('gl-hours'); el.value = '6'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(800);
  const t6 = await read(fr, ['gl-sky-n', 'gl-sky-pdop', 'gl-hours-val']);
  report.states.realT6 = t6;
  ok('真实模式 t0+6h 可见 ≥6 颗', +t6['gl-sky-n'] >= 6, t6['gl-sky-n']);
  ok('真实模式 t0+6h PDOP ≤ 6', +t6['gl-sky-pdop'] <= 6, t6['gl-sky-pdop']);
  await fr.evaluate(() => { const el = document.getElementById('gl-hours'); el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });

  /* 切回合成，确认可逆 */
  await fr.selectOption('#gl-const-src', 'syn');
  await page.waitForTimeout(700);
  const back = await read(fr, ['gl-sky-n', 'gl-sky-pdop']);
  report.states.back = back;
  ok('切回合成后可见星恢复 6–12', +back['gl-sky-n'] >= 6 && +back['gl-sky-n'] <= 12, back['gl-sky-n']);
  const sysEnabled = await fr.evaluate(() => !document.getElementById('gl-sys').disabled);
  ok('切回后系统叠加恢复可用', sysEnabled === true, sysEnabled);

  /* 冷启动：码相位精修修复后的误差（约定镜像修正） */
  const done = await coldRun(fr, page);
  ok('冷启动可跑完', done === true);
  const cold = await fr.evaluate(() => {
    const st = globalThis.GLAPP.panels.cold.state;
    const es = (st.items || []).map(i => i.chipsErrM).filter(v => isFinite(v));
    const rms = Math.sqrt(es.reduce((a, b) => a + b * b, 0) / Math.max(1, es.length));
    return { n: es.length, rmsM: rms, maxAbsM: Math.max.apply(null, es.map(Math.abs)), err: st.err, err1: st.err1,
      curve: (st.errCurve || []).map(p => Math.round(p.err)), chipCurve: (st.chipCurve || []).map(p => Math.round(p.rms)) };
  });
  report.states.cold = cold;
  ok('逐颗码相位误差 RMS < 60 m（修复前 ~120–200 m）', cold.rmsM < 60, cold.rmsM.toFixed(1) + ' m');
  ok('最差单颗码相位误差 < 100 m', cold.maxAbsM < 100, cold.maxAbsM.toFixed(1) + ' m');
  ok('多历元平均后位置误差 < 300 m', isFinite(cold.err) && cold.err < 300, cold.err && cold.err.toFixed(0) + ' m');
  await page.screenshot({ path: OUT + '/141-cold-fixed.png', fullPage: true });

  /* 暗色 + 窄屏 */
  const dp = await browser.newPage({ viewport: { width: 980, height: 1500 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  attach(dp, report.logs);
  await dp.goto(URL);
  const dfr = await frag(dp);
  await dp.waitForTimeout(1400);
  await dfr.selectOption('#gl-const-src', 'real');
  await dp.waitForTimeout(900);
  report.states.dark = await read(dfr, ['gl-sky-n', 'gl-sky-pdop']);
  await dp.screenshot({ path: OUT + '/142-dark-real.png', fullPage: true });
  await dp.setViewportSize({ width: 380, height: 1400 });
  await dp.waitForTimeout(900);
  report.states.narrow = await dfr.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2, noteH: document.getElementById('gl-const-note').clientHeight }));
  ok('窄屏无横向溢出', report.states.narrow.overflow === false, JSON.stringify(report.states.narrow));
  await browser.close();
  const failed = report.checks.filter(c => !c.pass);
  console.log(JSON.stringify(report, null, 1));
  console.log('---- check14: ' + (report.checks.length - failed.length) + '/' + report.checks.length + ' 通过，控制台问题 ' + report.logs.length + ' 条 ----');
  process.exit(failed.length || report.logs.length ? 1 : 0);
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(2); });
