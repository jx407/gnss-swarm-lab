const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch();
  for (const w of [420, 980]) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 }, colorScheme: 'light' });
    await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html');
    let fr = null;
    for (const f of p.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) fr = f; } catch (e) {} }
    await p.waitForTimeout(1200);
    await fr.click('#gl-tab-cold');
    await fr.click('#gl-cold-run');
    for (let i = 0; i < 300; i++) { const done = await fr.evaluate(() => { const s = globalThis.GLAPP.panels.cold.state; return !s.running && s.errCurve.length > 0; }); if (done) break; await p.waitForTimeout(400); }
    await p.waitForTimeout(600);
    await p.screenshot({ path: 'qa/layout/final-' + w + '-cold.png', fullPage: true });
    console.log('shot', w, 'done');
    await p.close();
  }
  await b.close();
})();
