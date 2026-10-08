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
    await fr.click('#gl-tab-mp'); await p.waitForTimeout(800);
    const el = await fr.$('#gl-mp-side');
    if (el) await el.screenshot({ path: 'qa/layout/mp-side-' + w + '.png' });
    await p.screenshot({ path: 'qa/layout/mp-full-' + w + '.png', fullPage: true });
    console.log('mp shots', w, 'done');
    await p.close();
  }
  await b.close();
})();
