'use strict';
/* 复现：420 宽、冷启动跑完后，gl-cold-canvas 上的 fillText 是否有越界 */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [420, 980]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      window.__T = [];
      const proto = CanvasRenderingContext2D.prototype;
      const ft = proto.fillText;
      proto.fillText = function (s, x, y) {
        try {
          if (this.canvas && this.canvas.id === 'gl-cold-canvas') {
            const m = this.measureText(String(s));
            const cs = getComputedStyle(this.canvas);
            const cw = parseFloat(cs.width.replace('px', ''));
            const ch = parseFloat(cs.height.replace('px', ''));
            const tw = m.width, asc = m.actualBoundingBoxAscent || 6, desc = m.actualBoundingBoxDescent || 2;
            let l, r;
            if (this.textAlign === 'right') { r = x; l = x - tw; }
            else if (this.textAlign === 'center') { l = x - tw / 2; r = x + tw / 2; }
            else { l = x; r = x + tw; }
            window.__T.push({ s: String(s), l: +l.toFixed(2), r: +r.toFixed(2), t: +(y - asc).toFixed(2), b: +(y + desc).toFixed(2), cw: cw, ch: ch });
          }
        } catch (e) { }
        return ft.apply(this, arguments);
      };
    });
    await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html', { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(900);
    await p.click('#gl-tab-cold');
    for (let i = 0; i < 400; i++) { if (!(await p.evaluate(() => GLAPP.panels.cold.state.running))) break; await p.waitForTimeout(150); }
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => {
      const bad = window.__T.filter(t => t.r > t.cw + 0.05 || t.l < -0.05 || t.b > t.ch + 0.05);
      return { total: window.__T.length, bad: bad.length, worst: bad.sort((a, b) => (b.r - b.cw) - (a.r - a.cw)).slice(0, 5),
               canvas: (document.getElementById('gl-cold-canvas').getBoundingClientRect().width) + 'x' + (document.getElementById('gl-cold-canvas').getBoundingClientRect().height) };
    });
    console.log('W=' + w + ' canvas=' + r.canvas + ' fillTexts=' + r.total + ' 越界=' + r.bad);
    r.worst.forEach(t => console.log('   "' + t.s + '" l=' + t.l + ' r=' + t.r + ' (cw=' + t.cw + ')'));
    await ctx.close();
  }
  await b.close();
})();
