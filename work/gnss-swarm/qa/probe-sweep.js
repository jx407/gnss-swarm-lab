'use strict';
/* probe-sweep：把每页控件推到极端档（selects 末项 / 滑杆 max 或 min / 勾选全开），
   对全部 canvas 做"文字越界 + 文字互压"体检。这是从"默认场景全绿"扩到"参数扫描"的对抗性判据。 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const PANELS = ['sky', 'ca', 'acq', 'pos', 'mp', 'raim', 'geo', 'atm', 'cold', 'pll'];

async function install(page) {
  await page.addInitScript(() => {
    window.__T = {};
    const P = CanvasRenderingContext2D.prototype;
    const oClear = P.clearRect, oFill = P.fillText;
    P.clearRect = function () { try { if (this.canvas) window.__T[this.canvas.id] = []; } catch (e) { } return oClear.apply(this, arguments); };
    P.fillText = function (s, x, y) {
      try {
        const cv = this.canvas, id = cv.id;
        const m = this.measureText(String(s));
        const rect = cv.getBoundingClientRect();
        const w = rect.width, h = rect.height;   /* 隐藏面板为 0：分析时跳过，避免 getComputedStyle 的 "100%" 被当成 100px */
        let l, r;
        if (this.textAlign === 'right') { r = x; l = x - m.width; }
        else if (this.textAlign === 'center') { l = x - m.width / 2; r = x + m.width / 2; }
        else { l = x; r = x + m.width; }
        const asc = isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : 7;
        const desc = isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : 3;
        (window.__T[id] = window.__T[id] || []).push({ s: String(s), l, r, t: y - asc, b: y + desc, w, h });
      } catch (e) { }
      return oFill.apply(this, arguments);
    };
  });
}

async function applyExtremes(page, panel, mode) {
  await page.evaluate(({ id, mode }) => {
    const p = document.getElementById(id);
    if (!p) return;
    p.querySelectorAll('select').forEach(s => {
      s.selectedIndex = (mode === 'min') ? 0 : s.options.length - 1;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    p.querySelectorAll('input[type=range]').forEach(r => {
      r.value = (mode === 'min') ? r.min : r.max;
      r.dispatchEvent(new Event('input', { bubbles: true }));
      r.dispatchEvent(new Event('change', { bubbles: true }));
    });
    p.querySelectorAll('input[type=checkbox]').forEach(c => {
      c.checked = (mode !== 'min');
      c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const b = Array.prototype.slice.call(p.querySelectorAll('button')).find(x => /执行|运行|跑/.test(x.textContent || ''));
    if (b) b.click();
  }, { id: 'gl-panel-' + panel, mode });
}

async function analyze(page) {
  return await page.evaluate(() => {
    const out = { clip: [], coll: [] };
    const all = window.__T || {};
    Object.keys(all).forEach(id => {
      const t = all[id];
      if (!t || !t.length) return;
      const w = t[0].w, h = t[0].h;
      if (!(w >= 5) || !(h >= 5)) return;   /* 隐藏面板：跳过 */
      t.forEach(x => {
        if (x.r > w + 0.05 || x.l < -0.05 || x.b > h + 0.05 || x.t < -0.05) {
          out.clip.push({ id, s: x.s.slice(0, 40), l: +x.l.toFixed(1), r: +x.r.toFixed(1), w: +w.toFixed(0), h: +h.toFixed(0) });
        }
      });
      for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
        const a = t[i], b = t[j];
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 0.5 && oy > 0.5) {
          const area = ox * oy;
          if (area > 2 && a.s !== b.s) out.coll.push({ id, a: a.s.slice(0, 26), b: b.s.slice(0, 26), area: +area.toFixed(1) });
        }
      }
    });
    return out;
  });
}

(async () => {
  const b = await chromium.launch();
  const found = [];
  for (const width of [360, 980]) {
    const ctx = await b.newContext({ viewport: { width, height: 844 } });
    const p = await ctx.newPage();
    const logs = [];
    p.on('pageerror', e => logs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
    await install(p);
    await p.goto(PAGE, { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(1500);

    const mode = [['max', PANELS], ['min', ['sky', 'acq', 'pos', 'atm', 'cold']]];
    for (const [list, panels] of mode) {
      for (const panel of panels) {
        await p.evaluate(() => { window.__T = {}; });
        await p.click('#gl-tab-' + panel);
        await p.waitForTimeout(200);
        await applyExtremes(p, panel, list);
        await p.waitForTimeout(panel === 'cold' ? 7000 : 1800);
        await p.click('#gl-tab-' + panel);
        await p.waitForTimeout(250);
        await p.evaluate((nn) => {
          const q = GLAPP.panels[nn]; if (q && q.draw) q.draw();
          if (nn === 'cold' && GLAPP.panels.dll && GLAPP.panels.dll.draw) GLAPP.panels.dll.draw();
          if (nn === 'pll' && GLAPP.panels.hatch && GLAPP.panels.hatch.draw) GLAPP.panels.hatch.draw();
        }, panel);
        await p.waitForTimeout(300);
        const r = await analyze(p);
        if (r.clip.length || r.coll.length) {
          found.push({ width, scenario: panel + '-' + list, clip: r.clip, coll: r.coll });
        }
        console.log('  ' + width + ' ' + panel + '-' + list + ' clip=' + r.clip.length + ' coll=' + r.coll.length);
      }
    }
    console.log('W=' + width + ' consoleIssues=' + logs.length + (logs.length ? ' :: ' + logs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
  console.log('==== 违规汇总 ====');
  if (!found.length) console.log('全部场景 0 越界 / 0 互压');
  found.forEach(f => {
    console.log('[' + f.width + ' ' + f.scenario + '] clip=' + f.clip.length + ' coll=' + f.coll.length);
    f.clip.slice(0, 6).forEach(c => console.log('   CLIP ' + c.id + ' "' + c.s + '" r=' + c.r + ' w=' + c.w + ' (h=' + c.h + ')'));
    f.coll.slice(0, 6).forEach(c => console.log('   COLL ' + c.id + ' "' + c.a + '" <> "' + c.b + '" area=' + c.area));
  });
})();
