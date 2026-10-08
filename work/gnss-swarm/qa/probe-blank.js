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
  const rows = await fr.evaluate(() => {
    const panel = document.getElementById('gl-panel-cold');
    const top = panel.getBoundingClientRect().top + window.scrollY;
    return [...panel.children].map(e => {
      const r = e.getBoundingClientRect();
      return { tag: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(/\s+/).filter(c => c).slice(0, 2).join('.') : ''), top: Math.round(r.top + window.scrollY - top), h: Math.round(r.height) };
    });
  });
  console.log('gl-panel-cold children (h>60 marked *):');
  for (const r of rows) console.log('  ' + (r.h > 60 ? '*' : ' ') + String(r.top).padStart(5) + ' +' + String(r.h).padStart(5) + '  ' + r.tag);
  await b.close();
})();
