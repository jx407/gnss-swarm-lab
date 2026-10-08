'use strict';
/* 复测：当前版本里 phaseM 的两个来源各贡献多少？f0·t 项（先验多普勒外推）vs φ 项（真正来自载波环） */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1400 } });
  await p.goto(PAGE_URL); await p.waitForTimeout(1500);
  let fr = null;
  for (const f of p.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) fr = f; } catch (e) { } }
  await fr.click('#gl-tab-cold'); await p.waitForTimeout(300);
  await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; });
  await fr.click('#gl-cold-run');
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await fr.evaluate(() => { const x = globalThis.GLAPP.panels.cold.state; return { r: x.running, h: (x.hatchCurve || []).length }; });
    if (!s.r && s.h > 0) break;
    await p.waitForTimeout(500);
  }
  const out = await fr.evaluate(() => {
    const G = globalThis.GNSS, APP = globalThis.GLAPP, st = APP.panels.cold.state;
    const LAM = G.CONST.c / 1575.42e6, M = 25, DT = 0.004;
    const rows = [];
    for (let k = 0; k < Math.min(3, st.items.length); k++) {
      const eps = [];
      for (let e = 0; e < st.epochs; e++) for (let j = 0; j < M; j++) eps.push(st.fine[k][e][j]);
      const f0 = st.prevDop[k];
      const pll = G.pllTrack(eps, { fNco0: f0, disc: 'atan' });
      const per = [];
      let maxF0 = 0, maxPhi = 0, maxTotErr = 0, maxAprioriErr = 0;
      for (let e = 0; e < st.epochs; e++) {
        const idx = (e + 1) * M - 1, idxPrev = e === 0 ? 0 : e * M - 1;
        const phi = pll.phase[idx] - pll.phase[idxPrev];
        /* 真实 ΔR：由面板存的真相位序列反推（truePhase 是各历元结束时刻的累积相位） */
        const tPrev = e === 0 ? 0 : st.truePhase[k][e - 1];
        const dTrue = st.truePhase[k][e] - tPrev;
        const dR = -LAM * dTrue / (2 * Math.PI);
        /* 面板公式是 phaseM = -LAM*(f0*t + φ/2π)，这里的负号不能漏（上一版探针漏了，导致"误差≈2ΔR"的假象） */
        const f0Term = -LAM * f0 * st.stepS;
        const phiTerm = -LAM * phi / (2 * Math.PI);
        const totErr = (f0Term + phiTerm) - dR;          /* 合起来对不对 */
        const aprioriErr = f0Term - dR;                  /* 只用先验多普勒时的误差 */
        per.push({ e: e, f0Term: f0Term, phiTerm: phiTerm, dR: dR, totErr: totErr, aprioriErr: aprioriErr });
        maxF0 = Math.max(maxF0, Math.abs(f0Term));
        maxPhi = Math.max(maxPhi, Math.abs(phiTerm));
        maxTotErr = Math.max(maxTotErr, Math.abs(totErr));
        maxAprioriErr = Math.max(maxAprioriErr, Math.abs(aprioriErr));
      }
      rows.push({ prn: st.items[k].prn, f0: f0, lockQual: pll.lockQual, maxF0: maxF0, maxPhi: maxPhi,
        ratio: maxPhi / Math.max(1e-9, maxF0), maxTotErr: maxTotErr, maxAprioriErr: maxAprioriErr, per: per });
    }
    return rows;
  });
  for (const r of out) {
    console.log('PRN ' + r.prn + '  f0=' + r.f0.toFixed(0) + ' Hz  lockQual=' + r.lockQual.toFixed(4) +
      '  |f0·t 项| ' + r.maxF0.toFixed(2) + ' m/历元,  |φ 项| ' + r.maxPhi.toFixed(2) + ' m/历元,  占比 ' + (100 * r.ratio).toFixed(1) + '%');
    console.log('   → 合起来(f0+φ)与真实 ΔR 的最大偏差 ' + r.maxTotErr.toFixed(3) + ' m/历元；只用先验 f0 时最大偏差 ' + r.maxAprioriErr.toFixed(3) + ' m/历元');
    console.log('   逐历元： ΔR=' + r.per.map(function (x) { return x.dR.toFixed(1); }).join(',') +
      '  合计误差=' + r.per.map(function (x) { return x.totErr.toFixed(2); }).join(','));
  }
  await b.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(1); });
