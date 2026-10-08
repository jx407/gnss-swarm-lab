'use strict';
/* 扫参数空间：电离层活跃度 × 伪距噪声 → 三情景水平 RMS（用来定判据阈值，不参与回归） */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1400 } });
  await p.goto(PAGE_URL);
  await p.waitForTimeout(1500);
  let fr = null;
  for (const f of p.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) fr = f; } catch (e) { } }
  await fr.click('#gl-tab-pos');
  await p.waitForTimeout(1000);
  for (const [act, sig] of [[1, 1], [1, 2], [1, 5], [20, 1], [20, 2], [20, 0.5], [50, 1]]) {
    await fr.evaluate(([a, s]) => {
      const ia = document.getElementById('gl-pos-iono-act');
      ia.value = String(a); ia.dispatchEvent(new Event('change', { bubbles: true }));
      const sl = document.getElementById('gl-pos-sigma');
      sl.value = String(s); sl.dispatchEvent(new Event('input', { bubbles: true }));
      globalThis.GLAPP.panels.pos.state.ionoRes = null;
    }, [act, sig]);
    await fr.click('#gl-pos-run');
    let r = null; const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      r = await fr.evaluate(() => {
        const st = globalThis.GLAPP.panels.pos.state;
        return st.ionoRes ? { n: st.ionoRes.none, m: st.ionoRes.model, d: st.ionoRes.dual, io: st.ionoRes.ioMax } : null;
      });
      if (r) break;
      await p.waitForTimeout(300);
    }
    if (!r) { console.log('act=' + act + ' sigma=' + sig + ' → 超时'); continue; }
    console.log('act=×' + act + ' σ=' + sig + ' → 不改正 ' + r.n.toFixed(1) + ' / 模型 ' + r.m.toFixed(1) + ' / 双频 ' + r.d.toFixed(1) +
      ' m  (L1 最大斜距延迟 ' + r.io.toFixed(1) + ' m)');
  }
  await b.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(1); });
