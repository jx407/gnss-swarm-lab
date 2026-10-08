'use strict';
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const PAGE_URL = 'file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1400 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(PAGE_URL); await p.waitForTimeout(1500);
  let fr = null;
  for (const f of p.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) fr = f; } catch (e) { } }
  await fr.click('#gl-tab-cold'); await p.waitForTimeout(400);
  await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; s.errCurve = []; s.hatchCurve = []; s.pllStats = []; });
  await fr.click('#gl-cold-run');
  await p.waitForTimeout(40000);
  const st = await fr.evaluate(() => {
    const s = globalThis.GLAPP.panels.cold.state;
    return { running: s.running, errCurve: (s.errCurve || []).length, hatchCurve: (s.hatchCurve || []).length,
      pllStats: (s.pllStats || []).length, hasFine: !!s.fine, hasRes: !!s.truePhaseRes, phase: s.phase, prog: s.progress };
  });
  console.log('state=', JSON.stringify(st));
  console.log('errors:', errs.length ? errs.join('\n') : '(none)');
  await b.close();
})().catch(e => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(1); });
