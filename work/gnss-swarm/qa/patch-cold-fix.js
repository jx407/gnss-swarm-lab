'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(file, s.split(find).join(rep));
  console.log('patched ' + file.split('/').pop());
}
/* App：运行中也统计检出数，避免 "undefined / 6" */
sub(root + 'app/80-coldstart.js', "  function render() {\n    if (APP.panels.cold && APP.panels.cold.draw) APP.panels.cold.draw();",
  "  function render() {\n    var det = 0;\n    for (var q = 0; q < st.items.length; q++) if (st.items[q] && st.items[q].detected) det++;\n    st.detected = det;\n    if (APP.panels.cold && APP.panels.cold.draw) APP.panels.cold.draw();");
/* QA：等"真正跑完"（曲线有数据）而不是只看 running */
sub(root + 'qa/check11.js', `async function waitDone(fr, page, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const running = await fr.evaluate(() => globalThis.GLAPP.panels.cold.state.running);
    if (!running) return true;
    await page.waitForTimeout(500);
  }
  return false;
}`,
`async function waitDone(fr, page, timeoutMs) {
  const t0 = Date.now();
  let started = false;
  while (Date.now() - t0 < timeoutMs) {
    const s = await fr.evaluate(() => ({ running: globalThis.GLAPP.panels.cold.state.running, n: (globalThis.GLAPP.panels.cold.state.items || []).length, curve: (globalThis.GLAPP.panels.cold.state.errCurve || []).length }));
    if (s.running || s.n > 0) started = true;
    if (started && !s.running && s.curve > 0) return true;
    await page.waitForTimeout(400);
  }
  return false;
}`);
