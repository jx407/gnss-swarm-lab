'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep, expect) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== (expect == null ? 1 : expect)) throw new Error('expected ' + (expect || 1) + ', got ' + n + ' in ' + file + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file + (n > 1 ? ' ×' + n : ''));
}
/* ① 所有面板统一走 APP.satsAt(t) */
sub('app/10-sky.js', "    var all = G.visible(G.allSats(t), r, -90);", "    var all = G.visible(APP.satsAt(t), r, -90);");
sub('app/10-sky.js', "      var vis = G.visible(G.allSats(x * 3600), r, S.mask);", "      var vis = G.visible(APP.satsAt(x * 3600), r, S.mask);");
sub('app/40-pos.js', "    var pool = G.visible(G.allSats(S0.hours * 3600), rec, 0);", "    var pool = G.visible(APP.satsAt(S0.hours * 3600), rec, 0);");
sub('app/60-raim.js', "    var pool = G.visible(G.allSats(S.hours * 3600), rec, 0);", "    var pool = G.visible(APP.satsAt(S.hours * 3600), rec, 0);");
sub('app/70-atm.js', "    var pool = G.visible(G.allSats(S.hours * 3600), rec, 0);", "    var pool = G.visible(APP.satsAt(S.hours * 3600), rec, 0);");
sub('app/50-mp.js', "    st.sats = G.visible(G.allSats(S.hours * 3600), st.rec, S.mask);", "    st.sats = G.visible(APP.satsAt(S.hours * 3600), st.rec, S.mask);");
sub('app/14-geo-scan.js', "      var rec = G.ecefFromGeodetic(c[1], c[2], 50);\n      var pd = [], hd = [], vd = [], vs = [], maxRel = 0, maxP = 0, maxH = 0;",
  "      var rec = G.ecefFromGeodetic(c[1], c[2], 50);\n      var satsAt = (typeof systems === 'function') ? systems : function (t) { return G.allSats(t); };\n      var pd = [], hd = [], vd = [], vs = [], maxRel = 0, maxP = 0, maxH = 0;");
sub('app/14-geo-scan.js', "        var vis = G.visible(G.allSats(h * 3600), rec, mask);", "        var vis = G.visible(satsAt(h * 3600), rec, mask);");
sub('app/14-geo-scan.js', "  function scan(cities, mask, stepH) {", "  function scan(cities, mask, stepH, systems) {");
sub('app/14-geo-scan.js', "    var rows = APP.geoScan(cities, S.mask, 0.25);", "    var rows = APP.geoScan(cities, S.mask, 0.25, APP.satsAt);");
/* ② 星座面板：系统选择 + 详情里加每系统可见数 */
sub('shell.html', `      <div class="gl-field">
        <label class="form-label" for="gl-lat">纬度 <span class="tabular-nums" id="gl-lat-val">31.2°N</span></label>`,
`      <div class="gl-field">
        <label class="form-label" for="gl-sys">卫星系统</label>
        <select class="form-select" id="gl-sys">
          <option value="G">仅 GPS（24 颗）</option>
          <option value="GE">GPS + Galileo（48 颗）</option>
          <option value="GEC">GPS + Galileo + BeiDou（72 颗）</option>
        </select>
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-lat">纬度 <span class="tabular-nums" id="gl-lat-val">31.2°N</span></label>`);
/* ③ 读法里点明多系统带来的变化 */
sub('shell.html', '读法：实心点高于掩膜、参与解算，空心点被掩膜剔除；PDOP &lt; 2 是好几何，&gt; 6 表示卫星挤在同一片天空，定位误差会被放大约 PDOP 倍。',
  '读法：实心点高于掩膜、参与解算，空心点被掩膜剔除；PDOP &lt; 2 是好几何，&gt; 6 表示卫星挤在同一片天空。把「卫星系统」从仅 GPS 切到三系统，可见星立刻从 7–9 颗变成 20+，PDOP 与定位误差同步下降——这正是真实接收机同时收 GPS/Galileo/BeiDou 的原因。');
