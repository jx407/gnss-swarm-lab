/* =====================================================================
 * GNSS 蜂群工作台 —— 独立 UI/UX 审计探针（只读，不改动被测页面）
 * 运行： node review/ds41/ui-audit.js
 * 产物： review/ds41/ui-shots/*.png   +   <tmp>/ds41-ui-metrics.json
 * ===================================================================== */
'use strict';
const { createRequire } = require('module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 默认审计"成品页"；可用 DS41_PAGE=<file://...> 指向冻结快照（并发编辑时保证截图与指标同源）
const PAGE_URL = process.env.DS41_PAGE || 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
const OUT_DIR = 'D:/codex/2026-10-05/new-chat/review/ds41';
const SHOT_DIR = path.join(OUT_DIR, 'ui-shots');
const METRICS_PATH = path.join(os.tmpdir(), process.env.DS41_METRICS || 'ds41-ui-metrics.json');

const WIDTHS = [1600, 1280, 980, 760, 420];
const THEMES = ['light', 'dark'];
const VIEW_H = 900;

// 期望 13 个标签页（用户判据）；实际以页面 role="tab" 为准
const EXPECTED_TABS = 13;

fs.mkdirSync(SHOT_DIR, { recursive: true });

/* ---------------- 页面内注入的度量函数（字符串化后在浏览器执行） --------- */
function inPageMetrics() {
  return function measurePanel(cfg) {
    const panel = document.getElementById(cfg.panelId);
    if (!panel) return { missing: true };
    const rect = (el) => el.getBoundingClientRect();
    const vis = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      if (parseFloat(cs.opacity || '1') <= 0.05) return false;
      // 关键：折叠的 <details> 内容在 Chrome 里仍有布局盒子（display 不是 none），
      // 但不可见。仅看 display/rect 会把"已折叠的长说明"算成可见元素。
      if (typeof el.checkVisibility === 'function') {
        try { if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false; } catch (e) { }
      }
      const r = rect(el);
      return r.width > 0.5 && r.height > 0.5;
    };
    const isCollapsedDetails = (el) => {
      let n = el;
      while (n && n !== panel) {
        if (n.tagName === 'DETAILS' && !n.open) return true;
        n = n.parentElement;
      }
      return false;
    };
    const label = (el) => {
      const id = el.id ? '#' + el.id : '';
      const cls = (el.className && typeof el.className === 'string')
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return el.tagName.toLowerCase() + id + cls;
    };

    /* --- 1. 控件 / 段落 / 文本体量 --- */
    const controls = Array.from(panel.querySelectorAll('input,select,button,textarea'))
      .filter(vis);
    const allParaEls = Array.from(panel.querySelectorAll('p,li'));
    const hiddenParaEls = allParaEls.filter((e) => !vis(e));
    const collapsedInHidden = hiddenParaEls.filter(isCollapsedDetails).length;
    const hiddenTextChars = hiddenParaEls.reduce((a, e) => a + (e.textContent || '').replace(/\s+/g, ' ').trim().length, 0);
    const collapsedDetails = Array.from(panel.querySelectorAll('details')).filter((d) => !d.open).length;
    const paras = allParaEls.filter(vis)
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0);
    const paraLens = paras.map((t) => t.length);
    const textAll = (panel.textContent || '').replace(/\s+/g, ' ').trim();

    /* --- 2. 面板高度 / 视口外高度 --- */
    const pr = rect(panel);
    const panelHeight = Math.round(Math.max(pr.height, panel.scrollHeight));

    /* --- 3. 横向溢出 --- */
    const docEl = document.documentElement;
    const pageOverflow = {
      scrollWidth: docEl.scrollWidth,
      clientWidth: docEl.clientWidth,
      overflowing: docEl.scrollWidth > docEl.clientWidth + 2,
      bodyScrollWidth: document.body.scrollWidth,
    };
    const hOverflow = [];
    Array.from(panel.querySelectorAll('*')).forEach((el) => {
      if (!vis(el)) return;
      const cw = el.clientWidth, sw = el.scrollWidth;
      if (cw > 0 && sw > cw + 2) {
        const cs = getComputedStyle(el);
        hOverflow.push({
          el: label(el), clientWidth: cw, scrollWidth: sw, delta: sw - cw,
          overflowX: cs.overflowX,
        });
      }
    });

    /* --- 4. 元素重叠（同面板内两两相交，叶子块级候选） --- */
    const cands = Array.from(panel.querySelectorAll('canvas,div,p,span,label,button,select,input,ul,li,svg,code,b,strong'))
      .filter(vis)
      .filter((e) => {
        let hasBlockChild = false;
        for (const c of e.children) {
          const d = getComputedStyle(c).display;
          if ((d === 'block' || d === 'flex' || d === 'grid' || d === 'table' || d === 'list-item') && vis(c)) { hasBlockChild = true; break; }
        }
        return !hasBlockChild;
      });
    const overlaps = [];
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i], b = cands[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = rect(a), rb = rect(b);
        const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ix <= 0 || iy <= 0) continue;
        const area = ix * iy;
        const minArea = Math.min(ra.width * ra.height, rb.width * rb.height);
        if (area > 40 && minArea > 0 && area / minArea > 0.10) {
          overlaps.push({
            a: label(a), b: label(b), area: Math.round(area),
            fracOfSmaller: +(area / minArea).toFixed(3),
            aRect: [Math.round(ra.left), Math.round(ra.top), Math.round(ra.width), Math.round(ra.height)],
            bRect: [Math.round(rb.left), Math.round(rb.top), Math.round(rb.width), Math.round(rb.height)],
          });
          if (overlaps.length >= 60) break;
        }
      }
      if (overlaps.length >= 60) break;
    }

    /* --- 5. 文字被裁 / 可滚动溢出 --- */
    const clipped = [], scrollable = [];
    Array.from(panel.querySelectorAll('*')).forEach((el) => {
      if (!vis(el)) return;
      const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!hasOwnText) return;
      const cs = getComputedStyle(el);
      const dy = el.scrollHeight - el.clientHeight;
      const dx = el.scrollWidth - el.clientWidth;
      if (dy > 1 || dx > 2) {
        const isHid = (v) => v === 'hidden' || v === 'clip';
        const isScroll = (v) => v === 'auto' || v === 'scroll';
        const rec = { el: label(el), dY: dy, dX: dx, overflowX: cs.overflowX, overflowY: cs.overflowY, fontSize: cs.fontSize, text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) };
        if (isHid(cs.overflowY) || isHid(cs.overflowX)) clipped.push(rec);
        else if (isScroll(cs.overflowY) || isScroll(cs.overflowX)) scrollable.push(rec);
      }
    });

    /* --- 6. canvas 显示尺寸 / 位图尺寸 --- */
    const canvases = Array.from(panel.querySelectorAll('canvas')).map((c) => {
      const r = rect(c);
      const dw = Math.round(r.width), dh = Math.round(r.height);
      const bw = c.width, bh = c.height;
      const dispAspect = dh > 0 ? dw / dh : 0;
      const bitAspect = bh > 0 ? bw / bh : 0;
      const mismatch = (dispAspect > 0 && bitAspect > 0) ? Math.abs(dispAspect - bitAspect) / bitAspect : null;
      return {
        id: c.id, visible: vis(c), dispW: dw, dispH: dh, bitmapW: bw, bitmapH: bh,
        zeroBitmap: bw === 0 || bh === 0,
        aspectMismatchPct: mismatch === null ? null : +(mismatch * 100).toFixed(1),
        squashed: mismatch !== null && mismatch > 0.05,
      };
    });

    /* --- 7. 控件分组（.viz-controls 行数 / 每行控件数） --- */
    const groups = Array.from(panel.querySelectorAll('.viz-controls')).map((g) => {
      const fields = Array.from(g.querySelectorAll('.gl-field')).filter(vis);
      const rows = new Map();
      fields.forEach((f) => {
        const t = Math.round(rect(f).top);
        let key = null;
        for (const k of rows.keys()) if (Math.abs(k - t) <= 6) { key = k; break; }
        if (key === null) { key = t; rows.set(key, []); }
        rows.get(key).push(label(f));
      });
      return { rows: rows.size, fields: fields.length, perRow: Array.from(rows.values()).map((a) => a.length) };
    });

    /* --- 8. 深色主题文字对比度（WCAG） --- */
    function parseColor(s) {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((x) => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function lum(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
    function ratio(f, b) { const L1 = lum(f), L2 = lum(b); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); }
    function effBg(el) {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = parseColor(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.5) return c;
        n = n.parentElement;
      }
      const bc = parseColor(getComputedStyle(document.body).backgroundColor);
      return bc && bc.a > 0.5 ? bc : { r: 255, g: 255, b: 255 };
    }
    const lowContrast = [];
    if (cfg.theme === 'dark') {
      Array.from(panel.querySelectorAll('*')).forEach((el) => {
        if (!vis(el)) return;
        const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
        if (!hasOwnText) return;
        const cs = getComputedStyle(el);
        const fg = parseColor(cs.color);
        if (!fg || fg.a < 0.5) return;
        const bg = effBg(el);
        const cr = ratio(fg, bg);
        const fs = parseFloat(cs.fontSize);
        const bold = parseInt(cs.fontWeight, 10) >= 700;
        const large = fs >= 24 || (fs >= 18.66 && bold);
        const need = large ? 3.0 : 4.5;
        if (cr < need) {
          lowContrast.push({ el: label(el), ratio: +cr.toFixed(2), need, fontSize: cs.fontSize, color: cs.color, fg: cs.color, bg: 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')', text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 50) });
        }
      });
      lowContrast.sort((a, b) => a.ratio - b.ratio);
    }

    /* --- 9. 目标尺寸（触控可用性） --- */
    const smallTargets = Array.from(panel.querySelectorAll('button,select,input[type=range],input[type=checkbox],a'))
      .filter(vis).map((e) => { const r = rect(e); return { el: label(e), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((t) => t.h < 32 || t.w < 24);

    return {
      tab: cfg.tab,
      panelId: cfg.panelId,
      panelHeight,
      panelTopInDoc: Math.round(pr.top + window.scrollY),
      controls: controls.length,
      controlIds: controls.map((c) => c.id || label(c)),
      paragraphs: paras.length,
      allParagraphs: allParaEls.length,
      hiddenParagraphs: hiddenParaEls.length,
      hiddenParagraphsInCollapsed: collapsedInHidden,
      hiddenTextChars,
      collapsedDetails,
      longestParagraph: paraLens.length ? Math.max.apply(null, paraLens) : 0,
      avgParagraph: paraLens.length ? Math.round(paraLens.reduce((a, b) => a + b, 0) / paraLens.length) : 0,
      textChars: textAll.length,
      statsValues: Array.from(panel.querySelectorAll('.viz-stat-value')).map((e) => (e.textContent || '').trim()),
      noteText: (() => { const n = panel.querySelector('.gl-note'); return n ? n.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : null; })(),
      pageOverflow,
      hOverflow: hOverflow.slice(0, 25),
      hOverflowCount: hOverflow.length,
      overlapCount: overlaps.length,
      overlaps: overlaps.slice(0, 12),
      clippedCount: clipped.length,
      clipped: clipped.slice(0, 10),
      scrollableCount: scrollable.length,
      canvases,
      groups,
      lowContrastCount: lowContrast.length,
      lowContrast: lowContrast.slice(0, 10),
      smallTargetCount: smallTargets.length,
      smallTargets: smallTargets.slice(0, 8),
      empty: textAll.length < 6 && canvases.length === 0 && controls.length === 0,
    };
  };
}

/* ---------------- 交互动作（每个标签页至少一次） ------------------------ */
async function doInteraction(page, tab) {
  return page.evaluate(function (tabName) {
    const fire = (el, ev) => el.dispatchEvent(new Event(ev, { bubbles: true }));
    const setRange = (id, v) => { const e = document.getElementById(id); if (!e) return 'MISSING ' + id; e.value = String(v); fire(e, 'input'); fire(e, 'change'); return 'range ' + id + '=' + e.value; };
    const bumpSelect = (id) => { const e = document.getElementById(id); if (!e || e.options.length < 2) return 'MISSING ' + id; e.selectedIndex = (e.selectedIndex + 1) % e.options.length; fire(e, 'change'); return 'select ' + id + '=' + e.value; };
    const clickBtn = (id) => { const e = document.getElementById(id); if (!e) return 'MISSING ' + id; e.click(); return 'click ' + id; };
    switch (tabName) {
      case 'sky': return setRange('gl-lat', 58.5);
      case 'ca': return bumpSelect('gl-prn2');
      case 'acq': return clickBtn('gl-acq-run');
      case 'pos': return clickBtn('gl-pos-run');
      case 'mp': return setRange('gl-mp-dist', 40);
      case 'raim': return clickBtn('gl-raim-run');
      case 'geo': return setRange('gl-lat', -33.5);
      case 'atm': return clickBtn('gl-atm-preset');
      case 'cold': return clickBtn('gl-cold-run');
      case 'pll': return clickBtn('gl-pll-run') + ' || ' + clickBtn('gl-hatch-run');
      default: return 'noop';
    }
  }, tab);
}

/* ---------------- 稳定性等待：签名连续 idleMs 不变视为完成 -------------- */
async function waitStable(page, panelId, idleMs, timeoutMs) {
  const t0 = Date.now();
  let last = null, lastChange = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const sig = await page.evaluate(function (pid) {
      const p = document.getElementById(pid);
      if (!p) return '';
      const stats = Array.from(p.querySelectorAll('.viz-stat-value')).map((e) => (e.textContent || '').trim()).join('|');
      const bars = Array.from(p.querySelectorAll('.progress-bar')).map((e) => e.style.width).join('|');
      const notes = Array.from(p.querySelectorAll('.gl-note')).map((e) => (e.textContent || '').trim()).join('|');
      return stats + '##' + bars + '##' + notes;
    }, panelId);
    if (sig !== last) { last = sig; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= idleMs) return { done: true, ms: Date.now() - t0 };
    await page.waitForTimeout(150);
  }
  return { done: false, ms: Date.now() - t0 };
}

/* ---------------- 主导航信息 -------------------------------------------- */
async function navInfo(page) {
  return page.evaluate(function () {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const r = tabs.length ? tabs[0].getBoundingClientRect() : { top: 0, height: 0 };
    const rows = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)));
    return {
      tabCount: tabs.length,
      labels: tabs.map((t) => (t.textContent || '').trim()),
      ids: tabs.map((t) => t.id),
      navRows: rows.size,
      navHeight: Math.round((document.querySelector('.nav') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
      navOverflowX: (() => { const n = document.querySelector('.nav'); return n ? { sw: n.scrollWidth, cw: n.clientWidth } : null; })(),
      firstTabHeight: Math.round(r.height),
    };
  });
}

/* ---------------- 单次 (width,theme) 会话 --------------------------------- */
async function runCombo(browser, width, theme, shoot) {
  if (shoot === undefined) shoot = true;
  const ctx = await browser.newContext({
    viewport: { width: width, height: VIEW_H },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const consoleErrors = [], consoleWarnings = [], pageErrors = [], failedReqs = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error') consoleErrors.push({ text: m.text().slice(0, 300), loc: m.location() });
    else if (t === 'warning') consoleWarnings.push({ text: m.text().slice(0, 300) });
  });
  page.on('pageerror', (e) => pageErrors.push({ message: String(e && e.message).slice(0, 300) }));
  page.on('requestfailed', (r) => failedReqs.push({ url: r.url().slice(0, 160), err: (r.failure() || {}).errorText }));

  const t0 = Date.now();
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.addStyleTag({ content: '*{transition:none!important;animation:none!important;}' });
  await page.waitForTimeout(1200);
  const loadMs = Date.now() - t0;

  const nav = await navInfo(page);
  const panelIds = await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.gl-panel')).map((p) => p.id);
  });
  const tabsFromDom = await page.evaluate(function () {
    return Array.from(document.querySelectorAll('[role="tab"]')).map((t) => ({ id: t.id, label: (t.textContent || '').trim(), controls: t.getAttribute('aria-controls') }));
  });

  const comboTabs = [];
  for (const t of tabsFromDom) {
    const tab = t.controls ? t.controls.replace('gl-panel-', '') : t.id.replace('gl-tab-', '');
    const panelId = t.controls;
    // 切到目标标签页
    await page.click('#' + t.id);
    await page.waitForTimeout(250);
    // 首次显示会触发面板自动 run（acq/pos/raim/atm/cold/pll），等它稳定
    await waitStable(page, panelId, 600, 60000);
    // 交互一次
    const action = await doInteraction(page, tab);
    const stability = await waitStable(page, panelId, 700, 60000);
    await page.waitForTimeout(120);
    // 截图：滚动到面板顶部（sky 保留导航在最上方）
    await page.evaluate(function (pid) {
      const p = document.getElementById(pid);
      if (!p) return;
      const top = p.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, pid === 'gl-panel-sky' ? 0 : Math.max(0, top - 6));
    }, panelId);
    await page.waitForTimeout(200);
    const shot = path.join(SHOT_DIR, width + '-' + theme + '-' + tab + '.png');
    if (shoot) await page.screenshot({ path: shot, fullPage: false });
    // 度量
    const measure = inPageMetrics();
    const metrics = await page.evaluate(measure, { panelId: panelId, tab: tab, theme: theme });
    comboTabs.push(Object.assign({}, metrics, {
      action: action,
      stable: stability.done,
      stableMs: stability.ms,
      shot: path.basename(shot),
      panelVisibleNow: await page.evaluate(function (pid) { const p = document.getElementById(pid); return !!p && !p.hidden; }, panelId),
    }));
    // 额外：该罐面板的 canvas 位图是否真的画了内容（非全透明）
    const canvasPainted = await page.evaluate(function (pid) {
      const p = document.getElementById(pid);
      if (!p) return [];
      return Array.from(p.querySelectorAll('canvas')).map(function (c) {
        try {
          const ctx = c.getContext('2d');
          if (!ctx || c.width === 0 || c.height === 0) return { id: c.id, painted: false, reason: 'no-ctx-or-zero' };
          const w = Math.min(c.width, 60), h = Math.min(c.height, 60);
          const d = ctx.getImageData(0, 0, w, h).data;
          let nonEmpty = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) nonEmpty++;
          return { id: c.id, painted: nonEmpty > 0, sampledNonEmpty: nonEmpty };
        } catch (e) { return { id: c.id, painted: null, reason: String(e.message).slice(0, 80) }; }
      });
    }, panelId);
    comboTabs[comboTabs.length - 1].canvasPainted = canvasPainted;
    // 交互后 note 文本（错误提示通常落在这里）
    comboTabs[comboTabs.length - 1].noteAfter = await page.evaluate(function (pid) {
      const p = document.getElementById(pid); if (!p) return null;
      const n = p.querySelector('.gl-note'); return n ? n.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : null;
    }, panelId);
    comboTabs[comboTabs.length - 1].renderError = /渲染出错|出错/.test(String(comboTabs[comboTabs.length - 1].noteAfter || ''));
  }

  // 额外：导航栏截图（sky 状态、页面顶部）
  await page.evaluate(function () { window.scrollTo(0, 0); });
  await page.waitForTimeout(150);
  if (shoot) await page.screenshot({ path: path.join(SHOT_DIR, width + '-' + theme + '-nav-top.png'), fullPage: false });

  const result = {
    width, theme, loadMs,
    nav, tabsFromDom, panelCount: panelIds.length,
    pageScrollHeight: await page.evaluate(function () { return document.documentElement.scrollHeight; }),
    docScrollWidth: await page.evaluate(function () { return document.documentElement.scrollWidth; }),
    consoleErrors, consoleWarnings, pageErrors, failedReqs,
    consoleErrorCount: consoleErrors.length,
    consoleWarningCount: consoleWarnings.length,
    pageErrorCount: pageErrors.length,
    failedRequestCount: failedReqs.length,
    tabs: comboTabs,
  };
  await ctx.close();
  return result;
}

(async function main() {
  if (process.env.DS41_MODE && process.env.DS41_MODE !== 'metrics2') return;
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const all = [];
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      process.stdout.write('RUN ' + width + '/' + theme + ' ... ');
      let r;
      try {
        r = await runCombo(browser, width, theme, process.env.DS41_MODE !== 'metrics2');
        process.stdout.write('ok tabs=' + r.tabs.length + ' err=' + r.consoleErrorCount + ' warn=' + r.consoleWarningCount + '\n');
      } catch (e) {
        r = { width, theme, fatal: String(e && e.stack || e) };
        process.stdout.write('FATAL ' + String(e && e.message) + '\n');
      }
      all.push(r);
    }
  }
  await browser.close();

  const summary = {
    page: PAGE_URL,
    generatedAt: new Date().toISOString(),
    expectedTabs: EXPECTED_TABS,
    viewportHeight: VIEW_H,
    widths: WIDTHS, themes: THEMES,
    runs: all.map((r) => ({
      width: r.width, theme: r.theme, fatal: r.fatal || null,
      tabCount: r.nav ? r.nav.tabCount : null,
      navRows: r.nav ? r.nav.navRows : null,
      consoleErrors: r.consoleErrorCount, consoleWarnings: r.consoleWarningCount,
      pageErrors: r.pageErrorCount, failedRequests: r.failedRequestCount,
      docScrollWidth: r.docScrollWidth, loadMs: r.loadMs,
      tabs: (r.tabs || []).map((t) => ({
        tab: t.tab, panelHeight: t.panelHeight, controls: t.controls, paragraphs: t.paragraphs,
        longest: t.longestParagraph, hOverflow: t.hOverflowCount, overlaps: t.overlapCount,
        clipped: t.clippedCount, lowContrast: t.lowContrastCount, smallTargets: t.smallTargetCount,
        canvasZero: (t.canvases || []).filter((c) => c.zeroBitmap).map((c) => c.id),
        canvasSquashed: (t.canvases || []).filter((c) => c.squashed).map((c) => c.id + ':' + c.aspectMismatchPct + '%'),
        stable: t.stable, renderError: t.renderError, empty: t.empty,
        noteAfter: t.noteAfter,
      })),
    })),
    detail: all,
  };
  fs.writeFileSync(METRICS_PATH, JSON.stringify(summary, null, 1), 'utf8');
  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify(summary.runs, null, 1));
  console.log('\nmetrics json -> ' + METRICS_PATH);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

/* =====================================================================
 * 验证模式：定向复核（DS41_MODE=verify node review/ds41/ui-audit.js）
 *   1) gl-dll-canvas 在点击它自己的按钮前后是否被绘制/被正确设定尺寸
 *   2) gl-sky-canvas 中心区域是否真的画了东西（角采样会误判）
 *   3) .gl-field 的 scrollWidth 超出 4px 到底来自哪个子元素
 *   4) cold/pll 面板内"重叠"是真重叠还是行内元素包围盒假阳性
 * ===================================================================== */
const VERIFY_PAGE = PAGE_URL;
const inPagePaint = function (id) {
  const c = document.getElementById(id);
  if (!c) return { id, missing: true };
  const r = c.getBoundingClientRect();
  let out = { id, dispW: Math.round(r.width), dispH: Math.round(r.height), bitmapW: c.width, bitmapH: c.height };
  try {
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    out.paintedPixels = n;
    out.painted = n > 0;
    // 中心 40%x40% 区域
    const x0 = Math.floor(c.width * 0.3), y0 = Math.floor(c.height * 0.3);
    const w = Math.max(1, Math.floor(c.width * 0.4)), h = Math.max(1, Math.floor(c.height * 0.4));
    const d2 = ctx.getImageData(x0, y0, w, h).data;
    let n2 = 0;
    for (let i = 3; i < d2.length; i += 4) if (d2[i] > 0) n2++;
    out.centerPainted = n2;
  } catch (e) { out.err = String(e.message).slice(0, 120); }
  return out;
};

(async function verify() {
  if (process.env.DS41_MODE !== 'verify') return;
  const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
  const report = {};

  /* ---- A. 1600/light：DLL 画布 & sky 画布 ---- */
  const ctxA = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const pA = await ctxA.newPage();
  const errsA = [];
  pA.on('console', (m) => { if (m.type() === 'error') errsA.push(m.text().slice(0, 200)); });
  pA.on('pageerror', (e) => errsA.push('pageerror: ' + String(e.message).slice(0, 200)));
  await pA.goto(VERIFY_PAGE, { waitUntil: 'load' });
  await pA.waitForTimeout(1200);

  await pA.click('#gl-tab-cold');
  await waitStable(pA, 'gl-panel-cold', 700, 60000);
  report.dllBeforeClick = await pA.evaluate(inPagePaint, 'gl-dll-canvas');
  report.dllBeforeNote = await pA.evaluate(() => (document.getElementById('gl-dll-note') || {}).textContent);

  await pA.click('#gl-dll-run');
  await waitStable(pA, 'gl-panel-cold', 900, 60000);
  await pA.waitForTimeout(300);
  report.dllAfterClick = await pA.evaluate(inPagePaint, 'gl-dll-canvas');
  report.dllAfterNote = await pA.evaluate(() => (document.getElementById('gl-dll-note') || {}).textContent);

  await pA.click('#gl-tab-pll');
  await waitStable(pA, 'gl-panel-pll', 900, 60000);
  report.hatchCanvas = await pA.evaluate(inPagePaint, 'gl-hatch-canvas');
  report.pllIqCanvas = await pA.evaluate(inPagePaint, 'gl-pll-iq');

  await pA.click('#gl-tab-sky');
  await waitStable(pA, 'gl-panel-sky', 700, 60000);
  report.skyCanvas = await pA.evaluate(inPagePaint, 'gl-sky-canvas');
  report.dopCanvas = await pA.evaluate(inPagePaint, 'gl-dop-canvas');

  /* ---- B. .gl-field 溢出子元素定位（sky 面板） ---- */
  report.fieldOverflowSource = await pA.evaluate(function () {
    const fields = Array.from(document.querySelectorAll('#gl-panel-sky .gl-field'));
    const out = [];
    fields.slice(0, 3).forEach(function (f) {
      const kids = Array.from(f.querySelectorAll('*')).map(function (c) {
        return { tag: c.tagName.toLowerCase(), id: c.id || '', cw: c.clientWidth, sw: c.scrollWidth, d: c.scrollWidth - c.clientWidth, ox: getComputedStyle(c).overflowX };
      }).filter(function (c) { return c.d > 2; });
      out.push({ field: '#' + (f.querySelector('label') && f.querySelector('label').htmlFor || ''), fieldCW: f.clientWidth, fieldSW: f.scrollWidth, overflowingKids: kids });
    });
    return out;
  });

  /* ---- C. cold 面板直接子元素布局（查真重叠） ---- */
  report.coldChildren1600 = await pA.evaluate(function () {
    const panel = document.getElementById('gl-panel-cold');
    return Array.from(panel.children).map(function (c) {
      const r = c.getBoundingClientRect();
      return { tag: c.tagName.toLowerCase(), id: c.id || '', cls: String(c.className || '').slice(0, 40), top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), h: Math.round(r.height) };
    });
  });
  report.errsA = errsA;
  await ctxA.close();

  /* ---- D. 420/light：pll 面板直接子元素布局 ---- */
  const ctxB = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const pB = await ctxB.newPage();
  await pB.goto(VERIFY_PAGE, { waitUntil: 'load' });
  await pB.waitForTimeout(1200);
  await pB.click('#gl-tab-pll');
  await waitStable(pB, 'gl-panel-pll', 900, 60000);
  report.pllChildren420 = await pB.evaluate(function () {
    const panel = document.getElementById('gl-panel-pll');
    return Array.from(panel.children).map(function (c) {
      const r = c.getBoundingClientRect();
      return { tag: c.tagName.toLowerCase(), id: c.id || '', cls: String(c.className || '').slice(0, 40), top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), h: Math.round(r.height) };
    });
  });
  report.coldChildren420 = await pB.evaluate(function () {
    const panel = document.getElementById('gl-panel-cold');
    return Array.from(panel.children).map(function (c) {
      const r = c.getBoundingClientRect();
      return { tag: c.tagName.toLowerCase(), id: c.id || '', cls: String(c.className || '').slice(0, 40), top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), h: Math.round(r.height) };
    });
  });
  report.dllBeforeClick420 = await pB.evaluate(inPagePaint, 'gl-dll-canvas');
  await ctxB.close();
  await browser.close();

  // 相邻块级子元素是否存在真正的负间隙
  function gaps(children) {
    const res = [];
    for (let i = 1; i < children.length; i++) {
      const g = children[i].top - children[i - 1].bottom;
      if (g < -1) res.push({ prev: children[i - 1].tag + (children[i - 1].id ? '#' + children[i - 1].id : ''), next: children[i].tag + (children[i].id ? '#' + children[i].id : ''), gap: g });
    }
    return res;
  }
  report.negativeGaps1600 = gaps(report.coldChildren1600);
  report.negativeGaps420pll = gaps(report.pllChildren420);
  report.negativeGaps420cold = gaps(report.coldChildren420);

  const outPath = path.join(os.tmpdir(), 'ds41-ui-verify.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 1), 'utf8');
  console.log(JSON.stringify(report, null, 1));
  console.log('\nverify json -> ' + outPath);
})().catch(function (e) { console.error('VERIFY FATAL', e); process.exit(1); });

/* =====================================================================
 * verify2：面板可见时的直接子元素布局（判"重叠"真伪）
 *   DS41_MODE=verify2 node review/ds41/ui-audit.js
 * ===================================================================== */
(function () {
  const modeEl = process.env.DS41_MODE;
  if (modeEl !== 'verify2') return;
  const inPageChildren = function (pid) {
    const panel = document.getElementById(pid);
    if (!panel || panel.hidden) return { pid, hidden: true };
    const kids = Array.from(panel.children).map(function (c) {
      const r = c.getBoundingClientRect();
      return { tag: c.tagName.toLowerCase(), id: c.id || '', cls: String(c.className || '').slice(0, 46),
        top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), h: Math.round(r.height) };
    });
    const neg = [];
    for (let i = 1; i < kids.length; i++) {
      const g = kids[i].top - kids[i - 1].bottom;
      if (g < -1) neg.push({ prev: kids[i - 1].tag + (kids[i - 1].id ? '#' + kids[i - 1].id : ''), next: kids[i].tag + (kids[i].id ? '#' + kids[i].id : ''), gap: g });
    }
    return { pid, panelH: Math.round(panel.getBoundingClientRect().height), kids, negativeGaps: neg };
  };
  (async function run() {
    const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
    const out = {};
    for (const w of [1600, 420]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
      const pg = await ctx.newPage();
      await pg.goto(PAGE_URL, { waitUntil: 'load' });
      await pg.waitForTimeout(1200);
      await pg.click('#gl-tab-cold');
      await waitStable(pg, 'gl-panel-cold', 900, 60000);
      out['cold' + w] = await pg.evaluate(inPageChildren, 'gl-panel-cold');
      await pg.click('#gl-tab-pll');
      await waitStable(pg, 'gl-panel-pll', 900, 60000);
      out['pll' + w] = await pg.evaluate(inPageChildren, 'gl-panel-pll');
      await ctx.close();
    }
    await browser.close();
    const p = path.join(os.tmpdir(), 'ds41-ui-verify2.json');
    fs.writeFileSync(p, JSON.stringify(out, null, 1), 'utf8');
    for (const k of Object.keys(out)) {
      console.log('=== ' + k + ' panelH=' + out[k].panelH + ' negativeGaps=' + JSON.stringify(out[k].negativeGaps));
      out[k].kids.forEach(function (c) { console.log('   ', c.tag + (c.id ? '#' + c.id : '') + ':' + c.cls, 'top=' + c.top, 'bottom=' + c.bottom, 'h=' + c.h); });
    }
    console.log('\njson -> ' + p);
  })().catch(function (e) { console.error('VERIFY2 FATAL', e); process.exit(1); });
})();

/* =====================================================================
 * verify3：复现"扫描时"状态（点过 gl-cold-run），判定重叠真伪
 *   DS41_MODE=verify3 node review/ds41/ui-audit.js
 * ===================================================================== */
(function () {
  if (process.env.DS41_MODE !== 'verify3') return;
  const inPage = function () {
    const panel = document.getElementById('gl-panel-cold');
    const kids = Array.from(panel.children);
    const dirOverlap = [];
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 0 && iy > 0) dirOverlap.push({ a: kids[i].tagName + (kids[i].id ? '#' + kids[i].id : ''), b: kids[j].tagName + (kids[j].id ? '#' + kids[j].id : ''), area: Math.round(ix * iy) });
    }
    const ps = Array.from(panel.querySelectorAll('p')).map(function (p) {
      const r = p.getBoundingClientRect();
      return { id: p.id || '', cls: String(p.className).slice(0, 40), top: Math.round(r.top + window.scrollY), h: Math.round(r.height), parent: p.parentElement.id || p.parentElement.className };
    });
    const prog = Array.from(panel.querySelectorAll('.progress,.progress-bar')).map(function (p) {
      const r = p.getBoundingClientRect();
      return { id: p.id, cls: p.className, top: Math.round(r.top + window.scrollY), h: Math.round(r.height) };
    });
    // 复刻扫描脚本的候选集，但打印 parent 以便定位假阳性
    const vis = function (el) { const c = getComputedStyle(el), r = el.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0.5 && r.height > 0.5; };
    const cands = Array.from(panel.querySelectorAll('canvas,div,p,span,label,button,select,input,ul,li,svg,code,b,strong'))
      .filter(vis).filter(function (e) { for (const c of e.children) { const d = getComputedStyle(c).display; if ((d === 'block' || d === 'flex' || d === 'grid' || d === 'table' || d === 'list-item') && vis(c)) return false; } return true; });
    const raw = [];
    for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i], b = cands[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix <= 0 || iy <= 0) continue;
      const area = ix * iy, minArea = Math.min(ra.width * ra.height, rb.width * rb.height);
      if (area > 40 && minArea > 0 && area / minArea > 0.10) {
        const info = function (e) { return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '[parent=' + (e.parentElement.id || String(e.parentElement.className).slice(0, 24)) + ']'; };
        raw.push({ a: info(a), b: info(b), area: Math.round(area), aInline: getComputedStyle(a).display, bInline: getComputedStyle(b).display });
        if (raw.length >= 20) break;
      }
    }
    return { panelH: Math.round(panel.getBoundingClientRect().height), dirOverlap, ps, prog, raw };
  };
  (async function run() {
    const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
    const res = {};
    for (const w of [1600, 420]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
      const pg = await ctx.newPage();
      await pg.goto(PAGE_URL, { waitUntil: 'load' });
      await pg.waitForTimeout(1200);
      await pg.click('#gl-tab-cold');
      await waitStable(pg, 'gl-panel-cold', 800, 60000);
      await pg.click('#gl-cold-run');
      await waitStable(pg, 'gl-panel-cold', 900, 60000);
      await pg.waitForTimeout(200);
      res['w' + w] = await pg.evaluate(inPage);
      await ctx.close();
    }
    await browser.close();
    for (const k of Object.keys(res)) {
      console.log('=== ' + k + ' panelH=' + res[k].panelH + ' 直接子元素相交对数=' + res[k].dirOverlap.length);
      res[k].dirOverlap.forEach(function (o) { console.log('    DIR', o.a, '<>', o.b, 'area=' + o.area); });
      console.log('    -- 段落 p 的盒子：');
      res[k].ps.forEach(function (p) { console.log('      ', (p.id || '(no id)'), p.cls, 'top=' + p.top, 'h=' + p.h, 'parent=' + p.parent); });
      console.log('    -- progress 盒子：', JSON.stringify(res[k].prog));
      console.log('    -- 原始候选重叠前 8 条（含 display）：');
      res[k].raw.slice(0, 8).forEach(function (o) { console.log('      ', o.a, o.aInline, '<>', o.b, o.bInline, 'area=' + o.area); });
    }
    fs.writeFileSync(path.join(os.tmpdir(), 'ds41-ui-verify3.json'), JSON.stringify(res, null, 1), 'utf8');
  })().catch(function (e) { console.error('VERIFY3 FATAL', e); process.exit(1); });
})();

/* =====================================================================
 * shotdll：定向取证截图（gl-dll-canvas 空白块 before/after）
 *   DS41_MODE=shotdll node review/ds41/ui-audit.js
 * ===================================================================== */
(function () {
  if (process.env.DS41_MODE !== 'shotdll') return;
  (async function run() {
    const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
    for (const w of [1600, 420]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
      const pg = await ctx.newPage();
      await pg.goto(PAGE_URL, { waitUntil: 'load' });
      await pg.waitForTimeout(1200);
      await pg.click('#gl-tab-cold');
      await waitStable(pg, 'gl-panel-cold', 800, 60000);
      // 滚到 DLL canvas 上方，露出"未点按钮"的空白块
      await pg.evaluate(function () {
        const c = document.getElementById('gl-dll-canvas');
        const y = c.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, y - 220));
      });
      await pg.waitForTimeout(250);
      await pg.screenshot({ path: path.join(SHOT_DIR, 'evidence-' + w + '-light-cold-dll-blank.png'), fullPage: false });
      // 点它自己的按钮后再拍一张
      await pg.click('#gl-dll-run');
      await waitStable(pg, 'gl-panel-cold', 900, 60000);
      await pg.evaluate(function () {
        const c = document.getElementById('gl-dll-canvas');
        const y = c.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, y - 220));
      });
      await pg.waitForTimeout(250);
      await pg.screenshot({ path: path.join(SHOT_DIR, 'evidence-' + w + '-light-cold-dll-after-click.png'), fullPage: false });
      await ctx.close();
      console.log('shotdll done ' + w);
    }
    await browser.close();
  })().catch(function (e) { console.error('SHOTDLL FATAL', e); process.exit(1); });
})();

/* =====================================================================
 * smoke：快速冒烟（成品页在被并发重建时，用来核对关键结论是否仍成立）
 *   DS41_MODE=smoke node review/ds41/ui-audit.js
 *   DS41_PAGE 可指向任意版本；只做"点开每个 tab + 记关键量"，不逐页等稳定/截图
 * ===================================================================== */
(function () {
  if (process.env.DS41_MODE !== 'smoke') return;
  (async function run() {
    const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
    const out = { page: PAGE_URL, at: new Date().toISOString(), widths: {} };
    for (const w of [1600, 420]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light' });
      const pg = await ctx.newPage();
      const errs = [], warns = [], perrs = [];
      pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); else if (m.type() === 'warning') warns.push(m.text().slice(0, 160)); });
      pg.on('pageerror', (e) => perrs.push(String(e.message).slice(0, 200)));
      await pg.goto(PAGE_URL, { waitUntil: 'load', timeout: 60000 });
      await pg.waitForTimeout(1000);
      const tabs = await pg.evaluate(() => Array.from(document.querySelectorAll('[role="tab"]')).map((t) => ({ id: t.id, label: (t.textContent || '').trim(), controls: t.getAttribute('aria-controls') })));
      const rows = [];
      for (const t of tabs) {
        await pg.click('#' + t.id);
        await pg.waitForTimeout(t.controls === 'gl-panel-cold' ? 9000 : 500);
        rows.push(await pg.evaluate(function (cfg) {
          const pid = cfg.pid, label = cfg.label;
          const p = document.getElementById(pid);
          const dll = document.getElementById('gl-dll-canvas');
          return {
            tab: pid.replace('gl-panel-', ''), label,
            panelH: p ? Math.round(p.getBoundingClientRect().height) : null,
            controls: p ? p.querySelectorAll('input,select,button,textarea').length : null,
            note: (p && p.querySelector('.gl-note')) ? p.querySelector('.gl-note').textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : null,
            dllDisplay: dll ? [Math.round(dll.getBoundingClientRect().width), Math.round(dll.getBoundingClientRect().height)] : null,
            dllBitmap: dll ? [dll.width, dll.height] : null,
            dllPainted: (function () {
              if (!dll || !dll.width || !dll.height) return null;
              try {
                const ctx = dll.getContext('2d');
                const d = ctx.getImageData(0, 0, dll.width, dll.height).data;
                let n = 0;
                for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
                return n;
              } catch (e) { return -1; }
            })(),
          };
        }, { pid: t.controls, label: t.label }));
      }
      out.widths[w] = { tabCount: tabs.length, labels: tabs.map((t) => t.label), errors: errs, warnings: warns, pageErrors: perrs, rows };
      await ctx.close();
    }
    await browser.close();
    const p = path.join(os.tmpdir(), 'ds41-ui-smoke.json');
    fs.writeFileSync(p, JSON.stringify(out, null, 1), 'utf8');
    for (const w of Object.keys(out.widths)) {
      const b = out.widths[w];
      console.log('=== ' + w + ' tabCount=' + b.tabCount + ' errors=' + b.errors.length + ' warnings=' + b.warnings.length + ' pageErrors=' + b.pageErrors.length);
      b.rows.forEach(function (r) { console.log('   ' + (r.tab + '').padEnd(6), 'panelH=' + r.panelH, 'controls=' + r.controls, 'dll=' + JSON.stringify(r.dllDisplay) + '/' + JSON.stringify(r.dllBitmap), 'painted=' + r.dllPainted); });
    }
    console.log('smoke json -> ' + p);
  })().catch(function (e) { console.error('SMOKE FATAL', e); process.exit(1); });
})();
