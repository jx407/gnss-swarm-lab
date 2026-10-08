const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 1000 }, colorScheme: 'light' });
  await p.goto('file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html');
  let fr = null;
  for (const f of p.frames()) { try { if (await f.evaluate(() => !!document.getElementById('gnss-lab'))) fr = f; } catch (e) {} }
  await p.waitForTimeout(1200); await fr.click('#gl-tab-cold'); await p.waitForTimeout(400);
  const order = await fr.evaluate(() => {
    const lab = document.getElementById('gnss-lab');
    return [...lab.children].map(e => (e.id || e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' ? e.className.split(' ')[0] : '')).slice(0, 28));
  });
  console.log('420 冷启动页 DOM 顶层顺序:', JSON.stringify(order, null, 0));
  await p.screenshot({ path: 'qa/layout/final2-420-cold.png', fullPage: true });
  await b.close();
})();
