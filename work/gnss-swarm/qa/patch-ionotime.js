'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep, expect) {
  let s = fs.readFileSync(file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== (expect == null ? 1 : expect)) throw new Error('expected ' + (expect || 1) + ', got ' + n + ' in ' + file + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(file, s.split(find).join(rep));
  console.log('patched ' + file.split('/').pop() + (n > 1 ? ' ×' + n : ''));
}
const atm = root + 'app/70-atm.js';
sub(atm, "  var ALPHA0 = [1.1176e-8, 0, -5.9605e-8, 0];",
  "  var ALPHA0 = [2.5e-8, 0, -1.2e-7, 0];   // 中等太阳活动量级（默认系数太弱，天顶只有 ~2 m）\n  /* 电离层按\"本地午后峰值\"计算：t=0 常落在 Klobuchar 的常数分支，天顶只有 2.6 m；\n     t=6h 在余弦分支内，天顶约 14 m——这才是代表性量级。 */\n  function ionoTime() { return 6 * 3600; }");
sub(atm, "    st.zen = G.atmosDelay(geo.rec, zenSat, tSec(), opts());", "    st.zen = G.atmosDelay(geo.rec, zenSat, ionoTime(), opts());");
sub(atm, "      var d = G.atmosDelay(geo.rec, { x: s.x, y: s.y, z: s.z }, tSec(), opts());", "      var d = G.atmosDelay(geo.rec, { x: s.x, y: s.y, z: s.z }, ionoTime(), opts());");
sub(atm, "      var I1 = G.ionoDelay(rec, sat, tSec(), ionoOpts()).slantM;", "      var I1 = G.ionoDelay(rec, sat, ionoTime(), ionoOpts()).slantM;");
sub(atm, "setText('gl-atm-detail', '站点 ' + C.fmt(S.lat, 1)", "setText('gl-atm-detail', '（按本地午后电离层峰值时刻）站点 ' + C.fmt(S.lat, 1)");
/* 曲线图也要用同一个时刻 */
sub(root + 'app/71-atm-draw.js', "      var d = G.atmosDelay(rec, sat, APP.state.hours * 3600, { fHz: st.fMHz * 1e6, relHumidity: st.rh, heightM: 50 });",
  "      var d = G.atmosDelay(rec, sat, 6 * 3600, { fHz: st.fMHz * 1e6, relHumidity: st.rh, heightM: 50, alpha: (APP.panels.atm.state && APP.panels.atm.ionoAlpha) ? APP.panels.atm.ionoAlpha() : undefined });");
sub(atm, "  APP.panels.atm = { state: st, run: run, updateStats: updateStats, geometry: geometry,",
  "  APP.panels.atm = { state: st, run: run, updateStats: updateStats, geometry: geometry, ionoAlpha: function () { return ionoOpts().alpha; },");
