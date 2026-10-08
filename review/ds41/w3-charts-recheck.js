/* =====================================================================
 * GNSS 蜂群工作台 · ds4.1 W2 图表可读性复核（只读）
 *
 * 目标：不改 outputs/app/shell/lib/tests/qa；
 *      以“运行时注入 Canvas 2D 探针”的方式记录 fillText/线段的逻辑坐标，
 *      对 420/980 两个宽度做定向截图、文字越界/碰撞检测和全 26 canvas 扫描。
 *
 * 运行：node review/ds41/w3-charts-recheck.js
 * 产物：review/ds41/w3-charts-recheck.md（脚本只打印；报告另行写 md）
 *       review/ds41/w3-charts-recheck/*.png
 *       review/ds41/w3-charts-recheck/metrics.json
 *
 * 说明：脚本使用 Codex 运行时内的 Playwright（本地 headless Chromium）读取
 *        file:// 的只读快照；不会向页面、输出目录或源码目录写入任何内容。
 * ===================================================================== */
'use strict';

const { createRequire } = require('module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = 'D:/codex/2026-10-05/new-chat';
const SRC = path.join(ROOT, 'outputs/gnss-swarm-lab.html');
const OUT = path.join(ROOT, 'review/ds41/w3-charts-recheck');
const INSTRUMENTED = path.join(OUT, '_instrumented.html');
const METRICS = path.join(OUT, 'metrics.json');
const WIDTHS = [420, 980];
const THEMES = ['light'];

fs.mkdirSync(OUT, { recursive: true });
const sourceHtml = fs.readFileSync(SRC, 'utf8');
const sourceHash = crypto.createHash('sha256').update(sourceHtml).digest('hex');

/* 运行时探针：必须早于 app/*.js 执行。记录每个 canvas 的每个 clearRect 帧、
 * fillText 包围盒、stroke 线段和 strokeRect 框。 */
const PROBE = String.raw`
(function () {
  if (window.__W2) return;
  var P = CanvasRenderingContext2D.prototype;
  var O = {
    clearRect: P.clearRect, fillText: P.fillText,
    beginPath: P.beginPath, moveTo: P.moveTo, lineTo: P.lineTo,
    rect: P.rect, arc: P.arc, stroke: P.stroke, strokeRect: P.strokeRect
  };
  var W = window.__W2 = { frames: {}, active: new WeakMap(), paths: new WeakMap(), seq: 0 };
  function color(v) { return typeof v === 'string' ? v : (v && v.toString ? v.toString() : ''); }
  function ensureFrame(ctx) {
    var f = W.active.get(ctx);
    if (f) return f;
    var cv = ctx.canvas, id = cv.id || ('canvas-' + (++W.seq));
    f = {
      seq: ++W.seq, canvasId: id, at: (window.performance && performance.now ? performance.now() : Date.now()),
      canvas: { backingW: cv.width, backingH: cv.height, cssW: cv.clientWidth, cssH: cv.clientHeight },
      texts: [], segments: [], rects: []
    };
    W.active.set(ctx, f);
    if (!W.frames[id]) W.frames[id] = [];
    W.frames[id].push(f);
    if (W.frames[id].length > 16) W.frames[id].shift();
    W.paths.delete(ctx);
    return f;
  }
  P.clearRect = function () {
    W.active.delete(this);
    ensureFrame(this);
    return O.clearRect.apply(this, arguments);
  };
  P.fillText = function (text, x, y) {
    var f = ensureFrame(this);
    var s = String(text);
    var m = this.measureText(s);
    var fm = /([0-9]+(?:\.[0-9]+)?)px/.exec(this.font || '');
    var size = fm ? parseFloat(fm[1]) : 11;
    var asc = isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * 0.78;
    var desc = isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * 0.22;
    var left, right;
    if (this.textAlign === 'right') { left = x - m.width; right = x; }
    else if (this.textAlign === 'center') { left = x - m.width / 2; right = x + m.width / 2; }
    else { left = x; right = x + m.width; }
    var top, bottom;
    if (this.textBaseline === 'top' || this.textBaseline === 'hanging') { top = y; bottom = y + asc + desc; }
    else if (this.textBaseline === 'bottom' || this.textBaseline === 'ideographic' || this.textBaseline === 'alphabetic') { bottom = y; top = y - asc - desc; }
    else { top = y - asc; bottom = y + desc; }
    f.texts.push({ text: s, x: x, y: y, left: left, right: right, top: top, bottom: bottom,
      width: m.width, ascent: asc, descent: desc, align: this.textAlign || 'start',
      baseline: this.textBaseline || 'alphabetic', font: this.font || '', fill: color(this.fillStyle) });
    return O.fillText.apply(this, arguments);
  };
  P.beginPath = function () { W.paths.set(this, { segs: [], last: null }); return O.beginPath.apply(this, arguments); };
  P.moveTo = function (x, y) { var p = W.paths.get(this); if (p) p.last = [x, y]; return O.moveTo.apply(this, arguments); };
  P.lineTo = function (x, y) {
    var p = W.paths.get(this);
    if (p) { var z = p.last; if (z) p.segs.push({ x1: z[0], y1: z[1], x2: x, y2: y }); p.last = [x, y]; }
    return O.lineTo.apply(this, arguments);
  };
  P.rect = function (x, y, w, h) {
    var p = W.paths.get(this);
    if (p) { p.segs.push({ x1:x,y1:y,x2:x+w,y2:y }, { x1:x+w,y1:y,x2:x+w,y2:y+h }, { x1:x+w,y1:y+h,x2:x,y2:y+h }, { x1:x,y1:y+h,x2:x,y2:y }); p.last = null; }
    return O.rect.apply(this, arguments);
  };
  P.arc = function (cx, cy, r, a0, a1, ccw) {
    var p = W.paths.get(this);
    if (p && isFinite(r) && r > 0) {
      var span = isFinite(a0) && isFinite(a1) ? a1 - a0 : Math.PI * 2;
      if (span < 0 && !ccw) span += Math.PI * 2;
      if (span > Math.PI * 2) span = Math.PI * 2;
      var n = Math.max(4, Math.ceil(Math.abs(span) / (Math.PI / 12)));
      var prev = null;
      for (var i = 0; i <= n; i++) {
        var a = a0 + span * i / n;
        var pt = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
        if (prev) p.segs.push({ x1: prev[0], y1: prev[1], x2: pt[0], y2: pt[1] });
        prev = pt;
      }
      p.last = prev;
    }
    return O.arc.apply(this, arguments);
  };
  P.stroke = function () {
    var f = W.active.get(this), p = W.paths.get(this);
    if (f && p) {
      var st = color(this.strokeStyle), lw = this.lineWidth || 1;
      for (var i = 0; i < p.segs.length; i++) {
        var s = p.segs[i];
        f.segments.push({ x1:s.x1, y1:s.y1, x2:s.x2, y2:s.y2, style:st, lineWidth:lw });
      }
    }
    return O.stroke.apply(this, arguments);
  };
  P.strokeRect = function (x, y, w, h) {
    var f = ensureFrame(this);
    f.rects.push({ x:x, y:y, w:w, h:h, style:color(this.strokeStyle), lineWidth:this.lineWidth || 1 });
    f.segments.push({x1:x,y1:y,x2:x+w,y2:y,style:color(this.strokeStyle),lineWidth:this.lineWidth||1});
    f.segments.push({x1:x+w,y1:y,x2:x+w,y2:y+h,style:color(this.strokeStyle),lineWidth:this.lineWidth||1});
    f.segments.push({x1:x+w,y1:y+h,x2:x,y2:y+h,style:color(this.strokeStyle),lineWidth:this.lineWidth||1});
    f.segments.push({x1:x,y1:y+h,x2:x,y2:y,style:color(this.strokeStyle),lineWidth:this.lineWidth||1});
    return O.strokeRect.apply(this, arguments);
  };
  W.analyze = function (canvasId) {
    var arr = W.frames[canvasId] || [], f = arr[arr.length - 1];
    if (!f) return { canvasId: canvasId, missing: true };
    var CW = f.canvas.cssW || f.canvas.backingW, CH = f.canvas.cssH || f.canvas.backingH;
    function overlap(a,b,pad) {
      pad = pad || 0;
      var l = Math.max(a.left, b.left) - pad, r = Math.min(a.right, b.right) + pad;
      var t = Math.max(a.top, b.top) - pad, bo = Math.min(a.bottom, b.bottom) + pad;
      return { ox: r-l, oy: bo-t, area: Math.max(0,r-l)*Math.max(0,bo-t), l:l, r:r, t:t, b:bo };
    }
    function segHit(t,s) {
      var l=t.left-1, r=t.right+1, tp=t.top-1, bo=t.bottom+1;
      var x1=s.x1,y1=s.y1,x2=s.x2,y2=s.y2;
      if (Math.max(x1,x2)<l || Math.min(x1,x2)>r || Math.max(y1,y2)<tp || Math.min(y1,y2)>bo) return false;
      var dx=x2-x1, dy=y2-y1, t0=0,t1=1;
      function clip(p,q){ if (p===0) return q>=0; var rr=q/p; if(p<0){if(rr>t1)return false;if(rr>t0)t0=rr;} else {if(rr<t0)return false;if(rr<t1)t1=rr;} return true; }
      return clip(-dx,x1-l)&&clip(dx,r-x1)&&clip(-dy,y1-tp)&&clip(dy,bo-y1);
    }
    var out = {
      canvasId: canvasId, seq: f.seq, canvas: f.canvas,
      textCount: f.texts.length, segmentCount: f.segments.length, rectCount: f.rects.length,
      clipped: [], textCollisions: [], textSegmentHits: [], rects: f.rects.slice().sort(function(a,b){return b.w*b.h-a.w*a.h;}).slice(0,6)
    };
    for (var i=0;i<f.texts.length;i++) {
      var t=f.texts[i];
      if (t.left < -0.5 || t.right > CW+0.5 || t.top < -0.5 || t.bottom > CH+0.5) out.clipped.push({i:textId(t),text:t.text,bbox:{l:t.left,t:t.top,r:t.right,b:t.bottom},canvas:{w:CW,h:CH}});
      for (var j=i+1;j<f.texts.length;j++) {
        var o=overlap(t,f.texts[j],0);
        if (o.area > 0.5) out.textCollisions.push({a:textId(t),b:textId(f.texts[j]),area:o.area,ox:o.ox,oy:o.oy});
      }
    }
    for (var k=0;k<f.texts.length;k++) {
      var tt=f.texts[k];
      for (var s=0;s<f.segments.length;s++) {
        var sg=f.segments[s];
        var len=Math.hypot(sg.x2-sg.x1,sg.y2-sg.y1);
        if (len < 3) continue;
        if (segHit(tt,sg)) out.textSegmentHits.push({text:textId(tt),textValue:tt.text,bbox:{l:tt.left,t:tt.top,r:tt.right,b:tt.bottom},seg:{x1:sg.x1,y1:sg.y1,x2:sg.x2,y2:sg.y2,style:sg.style,lineWidth:sg.lineWidth,len:len}});
      }
    }
    function textId(t) { return t.text + '@' + t.x.toFixed(1) + ',' + t.y.toFixed(1); }
    // 同一文本/同一线段的重复命中去重
    var seen={}; out.textSegmentHits=out.textSegmentHits.filter(function(h){var q=h.text+'|'+h.seg.x1.toFixed(1)+','+h.seg.y1.toFixed(1)+','+h.seg.x2.toFixed(1)+','+h.seg.y2.toFixed(1)+','+h.seg.style;if(seen[q])return false;seen[q]=1;return true;});
    out.textSegmentHits.sort(function(a,b){return a.textValue.localeCompare(b.textValue)||a.seg.len-b.seg.len;});
    // 只在报告里保留最可能是“文字压线”的命中；不把坐标轴网格线噪声当缺陷。
    out.textSegmentHits = out.textSegmentHits.slice(0,80);
    return out;
  };
  W.analyzeAll = function () { var o={}; Object.keys(W.frames).forEach(function(k){o[k]=W.analyze(k);}); return o; };
})();
`;

function instrument(html) {
  var block = '<script>\n' + PROBE + '\n</script>\n';
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, block + '</head>');
  return block + html;
}
fs.writeFileSync(INSTRUMENTED, instrument(sourceHtml), 'utf8');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitApp(page) {
  await page.waitForFunction(() => window.GLAPP && GLAPP.panels && GLAPP.panels.sky && GLAPP.panels.cold, null, { timeout: 30000 });
  await page.waitForTimeout(900);
}
async function showTab(page, name) {
  await page.click('#gl-tab-' + name);
  await page.waitForTimeout(350);
}
async function waitFor(page, fn, arg, timeout) {
  await page.waitForFunction(fn, arg, { timeout: timeout || 30000 });
}
async function runAllPanels(page, width) {
  // 先打开每个 panel，触发各面板的首次 draw；运行按钮再补足动态数据。
  const order = ['sky','ca','acq','pos','mp','raim','geo','atm','cold','pll'];
  for (const name of order) {
    await showTab(page, name);
    if (name === 'acq') {
      await page.click('#gl-acq-run');
      await waitFor(page, () => !!(GLAPP.panels.acq.state.result && GLAPP.panels.acq.state.result.surface), null, 30000);
      await sleep(300);
    } else if (name === 'pos') {
      await page.click('#gl-pos-run');
      await waitFor(page, () => !!(GLAPP.panels.pos.state.trials && GLAPP.panels.pos.state.trials.length >= 50), null, 30000);
      await sleep(300);
    } else if (name === 'raim') {
      await page.click('#gl-raim-run');
      await waitFor(page, () => !!(GLAPP.panels.raim.state.last), null, 30000);
      await sleep(300);
    } else if (name === 'atm') {
      await sleep(500);
    } else if (name === 'cold') {
      await page.click('#gl-cold-run');
      await waitFor(page, () => !GLAPP.panels.cold.state.running && GLAPP.panels.cold.state.items.length > 0 && GLAPP.panels.cold.state.errCurve.length > 0, null, 90000);
      await sleep(500);
      // 补充冷启动面板末端的 DLL 对比图和 Hatch 平滑图；它们各自是独立 canvas。
      if (await page.locator('#gl-dll-run').count()) {
        await page.click('#gl-dll-run');
        await waitFor(page, () => !!(GLAPP.panels.dll && GLAPP.panels.dll.state && GLAPP.panels.dll.state.data), null, 30000);
        await sleep(300);
      }
      await showTab(page, 'pll');
      if (await page.locator('#gl-pll-run').count()) {
        await page.click('#gl-pll-run');
        await waitFor(page, () => !!(GLAPP.panels.pll.state.res), null, 30000);
        await sleep(300);
      }
      if (await page.locator('#gl-hatch-run').count()) {
        await page.click('#gl-hatch-run');
        await waitFor(page, () => !!(GLAPP.panels.hatch && GLAPP.panels.hatch.state && GLAPP.panels.hatch.state.res), null, 30000);
        await sleep(300);
      }
    } else if (name === 'pll') {
      // 已由冷启动分支运行过；这里仅保证面板绘制。
      await sleep(300);
    } else if (name === 'mp') {
      // 选一颗能产生有效反射的卫星，保证侧视图进入有射线状态。
      await page.evaluate(() => {
        const sel = document.getElementById('gl-mp-prn');
        if (!sel) return;
        for (let i = 0; i < sel.options.length; i++) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          const st = GLAPP.panels.mp.state;
          if (st && st.last && st.last.ok) break;
        }
      });
      await sleep(500);
    }
  }
  // 最终把所有 panel 的关键 draw 再触发一次，确保最新 frame 与当前 state 同源。
  for (const name of ['sky','ca','acq','pos','mp','raim','geo','atm','cold','pll']) {
    await showTab(page, name);
    await page.evaluate((n) => {
      const p = GLAPP.panels[n];
      if (p && p.draw) p.draw();
      if (n === 'cold' && GLAPP.panels.dll && GLAPP.panels.dll.draw) GLAPP.panels.dll.draw();
      if (n === 'pll' && GLAPP.panels.hatch && GLAPP.panels.hatch.draw) GLAPP.panels.hatch.draw();
    }, name);
    await sleep(120);
  }
}
async function shotCanvas(page, width, id, tag) {
  const panelOf = {
    'gl-cold-epoch-canvas':'cold', 'gl-cold-canvas':'cold', 'gl-cold-ttff':'cold', 'gl-dll-canvas':'cold',
    'gl-sky-canvas':'sky', 'gl-dop-canvas':'sky', 'gl-doppler-canvas':'sky',
    'gl-chip-canvas':'ca', 'gl-pos-scatter':'pos', 'gl-pos-resid':'pos', 'gl-pos-iono-canvas':'pos',
    'gl-raim-resid':'raim', 'gl-raim-scatter':'raim', 'gl-raim-pl':'raim',
    'gl-geo-canvas':'geo', 'gl-pll-iq':'pll', 'gl-pll-phase':'pll', 'gl-hatch-canvas':'pll',
    'gl-acq-profile':'acq', 'gl-acq-canvas':'acq',
    'gl-atm-canvas':'atm', 'gl-atm-err-canvas':'atm',
    'gl-auto-canvas':'ca', 'gl-cross-canvas':'ca',
    'gl-mp-canvas':'mp', 'gl-mp-curve':'mp'
  };
  await showTab(page, panelOf[id] || 'sky');
  const el = page.locator('#' + id);
  if (!(await el.count())) { console.log('SHOT_MISSING', width, id); return null; }
  await el.scrollIntoViewIfNeeded();
  await sleep(120);
  const file = path.join(OUT, width + '-' + tag + '.png');
  await el.screenshot({ path: file });
  return path.basename(file);
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files', '--disable-gpu'] });
  const report = {
    generatedAt: new Date().toISOString(),
    source: SRC,
    sourceHash,
    sourceBytes: Buffer.byteLength(sourceHtml),
    instrumentedHtml: INSTRUMENTED,
    widths: {}
  };
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        reducedMotion: 'reduce'
      });
      const page = await context.newPage();
      const consoleErrors = [], pageErrors = [];
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
      page.on('pageerror', e => pageErrors.push(String(e.message).slice(0, 300)));
      const t0 = Date.now();
      await page.goto('file:///' + INSTRUMENTED.replace(/\\/g, '/'), { waitUntil: 'load', timeout: 60000 });
      await waitApp(page);
      await runAllPanels(page, width);
      const shots = {};
      // 5 个定向问题 + 相关右端刻度的全部裁剪图
      const shotList = [
        ['gl-cold-epoch-canvas','01-cold-epoch'],
        ['gl-cold-canvas','02-cold-persat'],
        ['gl-acq-profile','03-acq-profile'],
        ['gl-acq-canvas','04-acq-heat'],
        ['gl-atm-canvas','04-atm-delay'],
        ['gl-atm-err-canvas','04-atm-error'],
        ['gl-auto-canvas','04-ca-auto'],
        ['gl-cross-canvas','04-ca-cross'],
        ['gl-mp-canvas','05-mp-side'],
        ['gl-mp-curve','05-mp-curve'],
        ['gl-sky-canvas','all-sky'], ['gl-dop-canvas','all-dop'], ['gl-doppler-canvas','all-doppler'],
        ['gl-chip-canvas','all-chip'], ['gl-pos-scatter','all-pos-scatter'], ['gl-pos-resid','all-pos-resid'], ['gl-pos-iono-canvas','all-pos-iono'],
        ['gl-raim-resid','all-raim-resid'], ['gl-raim-scatter','all-raim-scatter'], ['gl-raim-pl','all-raim-pl'],
        ['gl-geo-canvas','all-geo'], ['gl-cold-ttff','all-cold-ttff'], ['gl-dll-canvas','all-dll'],
        ['gl-pll-iq','all-pll-iq'], ['gl-pll-phase','all-pll-phase'], ['gl-hatch-canvas','all-hatch']
      ];
      for (const [id, tag] of shotList) shots[id] = await shotCanvas(page, width, id, tag);
      const metrics = await page.evaluate(() => window.__W2.analyzeAll());
      const panels = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll('.gl-panel').forEach(p => {
          const cs = [...p.querySelectorAll('canvas')].map(c => c.id);
          out[p.id] = { hidden: p.hidden, canvasIds: cs, scrollWidth: p.scrollWidth, clientWidth: p.clientWidth };
        });
        return out;
      });
      report.widths[width] = { theme, loadMs: Date.now() - t0, consoleErrors, pageErrors, shots, metrics, panels };
      await context.close();
    }
  }
  await browser.close();
  fs.writeFileSync(METRICS, JSON.stringify(report, null, 2), 'utf8');
  // stdout：紧凑但足够复核的真实运行结果
  console.log('PAGE', report.source, 'hash=' + sourceHash.slice(0, 12), 'bytes=' + report.sourceBytes);
  for (const w of WIDTHS) {
    const r = report.widths[w];
    console.log('WIDTH', w, 'loadMs=' + r.loadMs, 'consoleErrors=' + r.consoleErrors.length, 'pageErrors=' + r.pageErrors.length);
    const ids = Object.keys(r.metrics).sort();
    for (const id of ids) {
      const m = r.metrics[id];
      console.log('CANVAS', w, id, 'text=' + m.textCount, 'clip=' + m.clipped.length, 'textColl=' + m.textCollisions.length, 'segHits=' + m.textSegmentHits.length, 'css=' + m.canvas.cssW + 'x' + m.canvas.cssH);
      if (m.clipped.length) m.clipped.slice(0, 8).forEach(c => console.log('  CLIP', c.text, JSON.stringify(c.bbox), 'canvas', JSON.stringify(c.canvas)));
      if (m.textCollisions.length) m.textCollisions.slice(0, 8).forEach(c => console.log('  TCOLL', c.area.toFixed(1), c.a, '<>', c.b));
      if (m.textSegmentHits.length) m.textSegmentHits.slice(0, 5).forEach(c => console.log('  SEG', c.textValue, 'line=' + c.seg.len.toFixed(1), c.seg.style));
    }
    console.log('SHOTS', w, JSON.stringify(r.shots));
  }
  console.log('WROTE', METRICS);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
