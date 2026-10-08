'use strict';
/* probe-layout2：逐个标签页点开，量"可见时"的面板高度/控件/段落/画布 + 横向溢出 + 控制台错误 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa/layout';
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
async function frag(page) {
  for (let i = 0; i < 40; i++) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) return f; } catch (e) { } }
    await page.waitForTimeout(100);
  }
  throw new Error('fragment frame not found');
}
(async () => {
  const browser = await chromium.launch();
  const logs = [];
  for (const w of [1280, 980, 420]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1000 }, colorScheme: 'light' });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(w + ': ' + m.text()); });
    page.on('pageerror', e => logs.push(w + ' pageerror: ' + (e && e.message ? e.message : e)));
    await page.goto(PAGE_URL);
    const fr = await frag(page);
    await page.waitForTimeout(1000);
    const tabs = await fr.evaluate(() => [...document.querySelectorAll('[id^="gl-tab-"]')].map(t => t.id));
    console.log('=== 宽度 ' + w + '（' + tabs.length + ' 个标签页）===');
    console.log('  标签页'.padEnd(22) + '高度  控件 段落 最长段 画布 溢出 详情块');
    for (const tid of tabs) {
      await fr.click('#' + tid);
      await page.waitForTimeout(350);
      const m = await fr.evaluate(() => {
        const pid = [...document.querySelectorAll('[id^="gl-tab-"]')].find(t => t.getAttribute('aria-selected') === 'true').getAttribute('aria-controls');
        const p = document.getElementById(pid);
        const vis = [...p.querySelectorAll('p,li')].map(e => e.textContent.trim()).filter(Boolean);
        const canv = [...p.querySelectorAll('canvas')];
        const det = p.querySelectorAll('details');
        const doc = document.documentElement;
        return { pid, h: Math.round(p.getBoundingClientRect().height), fields: p.querySelectorAll('.gl-field').length,
          para: p.querySelectorAll('p').length, longest: vis.length ? Math.max(...vis.map(t => t.length)) : 0,
          canvas: canv.length, zeroCanvas: canv.filter(c => c.getBoundingClientRect().width < 5).length,
          details: det.length, openDetails: [...det].filter(d => d.open).length,
          overflow: doc.scrollWidth > doc.clientWidth + 2 };
      });
      console.log(('  ' + m.pid.replace('gl-panel-', '')).padEnd(22) + String(m.h).padStart(5) + String(m.fields).padStart(6) + String(m.para).padStart(5) +
        String(m.longest).padStart(7) + String(m.canvas).padStart(5) + (m.zeroCanvas ? ' 空' + m.zeroCanvas : '  -') + (m.overflow ? '  是' : '  否') + '  ' + m.details + '/' + m.openDetails);
      if (w === 980) await page.screenshot({ path: OUT + '/980-' + m.pid.replace('gl-panel-', '') + '.png', fullPage: true });
    }
    if (w === 980) {
      const anyZero = await fr.evaluate(() => [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width < 5 && !c.closest('[hidden]')).length);
      console.log('  可见但宽度<5px 的画布：' + anyZero);
    }
    await page.close();
  }
  await browser.close();
  console.log('控制台问题 ' + logs.length + ' 条' + (logs.length ? ': ' + logs.slice(0, 5).join(' | ') : ''));
})();
