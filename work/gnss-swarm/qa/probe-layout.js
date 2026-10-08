'use strict';
/* probe-layout：多宽度 × 明暗下量"结构完整 / 无溢出 / 不拥挤"的客观指标 + 截图 */
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
const measure = () => {
  const lab = document.getElementById('gnss-lab');
  const tabs = [...document.querySelectorAll('[id^="gl-tab-"]')].map(t => ({ id: t.id, label: t.textContent.trim(), w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height) }));
  const panels = [...document.querySelectorAll('.gl-panel')].map(p => {
    const vis = !p.hidden;
    const ctrls = p.querySelectorAll('.gl-field').length;
    const canvas = p.querySelectorAll('canvas').length;
    const paras = [...p.querySelectorAll('p')].map(x => x.textContent.trim().length);
    const r = p.getBoundingClientRect();
    return { id: p.id, visible: vis, fields: ctrls, canvas, longestPara: paras.length ? Math.max(...paras) : 0, para: paras.length, h: Math.round(r.height), w: Math.round(r.width) };
  });
  const doc = document.documentElement;
  return {
    pageH: Math.round(doc.scrollHeight), pageW: Math.round(doc.scrollWidth), clientW: doc.clientWidth,
    overflowX: doc.scrollWidth > doc.clientWidth + 2,
    tabs, panels,
    unstyled: (() => {
      const s = getComputedStyle(document.querySelector('.form-select') || document.body);
      return { formSelectBorder: s.borderTopWidth, formSelectRadius: s.borderRadius, fontFamily: getComputedStyle(document.body).fontFamily };
    })(),
    canvases: [...document.querySelectorAll('canvas')].map(c => ({ id: c.id, w: Math.round(c.getBoundingClientRect().width), h: Math.round(c.getBoundingClientRect().height), bw: c.width, bh: c.height })).filter(c => c.w > 0)
  };
};
(async () => {
  const browser = await chromium.launch();
  const logs = [];
  for (const w of [1600, 1280, 980, 760, 420]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1200 }, deviceScaleFactor: 1, colorScheme: 'light' });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(w + ': ' + m.text()); });
    page.on('pageerror', e => logs.push(w + ' pageerror: ' + (e && e.message ? e.message : e)));
    await page.goto(PAGE_URL);
    const fr = await frag(page);
    await page.waitForTimeout(1200);
    if (w === 980) await fr.click('#gl-tab-cold');
    const m = await fr.evaluate(measure);
    console.log('=== 宽度 ' + w + ' ===');
    console.log('  页面 ' + m.pageW + 'x' + m.pageH + '，横向溢出=' + m.overflowX + '，标签 ' + m.tabs.length + ' 个');
    console.log('  标题宽度(最小/最大) = ' + Math.min(...m.tabs.map(t => t.w)) + '/' + Math.max(...m.tabs.map(t => t.w)) +
      '，高度 ' + Math.min(...m.tabs.map(t => t.h)) + '/' + Math.max(...m.tabs.map(t => t.h)));
    const bad = m.panels.filter(p => p.visible && (p.h > 1600 || p.longestPara > 1200));
    if (bad.length) console.log('  ⚠ 高面板/超长段落: ' + bad.map(p => p.id + '(h=' + p.h + ',最长段=' + p.longestPara + '字)').join(' '));
    console.log('  控件数/画布/段落/最长段 top5 面板：');
    m.panels.slice().sort((a, b) => (b.fields * 100 + b.longestPara / 10) - (a.fields * 100 + a.longestPara / 10)).slice(0, 5)
      .forEach(p => console.log('    ' + p.id.padEnd(20) + ' 控件 ' + p.fields + ' 画布 ' + p.canvas + ' 段 ' + p.para + ' 最长 ' + p.longestPara + ' 字 高 ' + p.h));
    console.log('  可见画布 ' + m.canvases.length + ' 个；表单样式 ' + JSON.stringify(m.unstyled));
    await page.screenshot({ path: OUT + '/' + w + '.png', fullPage: false });
    if (w === 980) await page.screenshot({ path: OUT + '/980-cold-full.png', fullPage: true });
    await page.close();
  }
  const dark = await browser.newPage({ viewport: { width: 980, height: 1200 }, colorScheme: 'dark' });
  await dark.goto(PAGE_URL); const dfr = await frag(dark); await dark.waitForTimeout(1200); await dfr.click('#gl-tab-cold');
  await dark.screenshot({ path: OUT + '/980-dark-cold.png', fullPage: true });
  await browser.close();
  console.log('控制台问题 ' + logs.length + ' 条' + (logs.length ? ': ' + logs.slice(0, 5).join(' | ') : ''));
})();
