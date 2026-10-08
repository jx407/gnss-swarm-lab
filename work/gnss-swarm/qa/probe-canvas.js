const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 980, height: 1200 } });
  await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html');
  let fr = null;
  for (const f of p.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) fr = f; } catch (e) {} }
  await p.waitForTimeout(1200); await fr.click('#gl-tab-cold'); await p.waitForTimeout(400);
  console.log(await fr.evaluate(() => ['gl-cold-canvas','gl-cold-ttff','gl-cold-epoch-canvas','gl-dll-canvas'].map(id => {
    const c = document.getElementById(id); const r = c.getBoundingClientRect(); const cs = getComputedStyle(c);
    return id + ': bitmap ' + c.width + 'x' + c.height + ' | css ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' | style.height=' + (c.style.height || '(none)') + ' | computedH=' + cs.height;
  })));
  await b.close();
})();
