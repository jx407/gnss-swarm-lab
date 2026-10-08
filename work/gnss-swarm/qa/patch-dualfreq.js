'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 70));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* ---- 70-atm.js：活跃度 / σ / 双频三情景对照 ---- */
sub('app/70-atm.js', "var st = { fMHz: 1575.42, rh: 0.5, corr: 0.7,",
  "var st = { fMHz: 1575.42, rh: 0.5, corr: 0.7, activity: 1, sigma: 2,");
sub('app/70-atm.js', "  function opts() { return { fHz: st.fMHz * 1e6, relHumidity: st.rh, heightM: 50 }; }",
`  var ALPHA0 = [1.1176e-8, 0, -5.9605e-8, 0];
  function ionoOpts(scale) {
    var a = Math.max(1, scale == null ? st.activity : scale);
    return { fHz: 1575.42e6, alpha: [ALPHA0[0] * a, ALPHA0[1] * a, ALPHA0[2] * a, ALPHA0[3] * a] };
  }
  function opts() { return { fHz: st.fMHz * 1e6, relHumidity: st.rh, heightM: 50, alpha: ionoOpts().alpha }; }
  /* 三情景同噪声对照：① L1 不改正 ② L1 + 模型改正 corr ③ L1/L2 消电离层组合 */
  function threeWay() {
    var geo = st.geo, rec = geo.rec;
    var F1 = 1575.42e6, F2 = 1227.60e6, k = Math.pow(F1 / F2, 2);
    var w1 = k / (k - 1), w2 = -1 / (k - 1);
    var meas = G.simulatePseudoranges(geo.sats, rec, { clockBiasM: 0, noiseSigmaM: 0, seed: 1 });
    var rnd = G.mulberry32(4242);
    function gauss() { var u1 = 1 - rnd(), u2 = rnd(); return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }
    var raw = [], modeled = [], dual = [];
    for (var i = 0; i < meas.length; i++) {
      var m = meas[i], sat = { x: m.x, y: m.y, z: m.z };
      var I1 = G.ionoDelay(rec, sat, tSec(), ionoOpts()).slantM;
      var n1 = gauss() * st.sigma, n2 = gauss() * st.sigma;
      var rho1 = m.prM + I1 + n1;
      var rho2 = m.prM + I1 * k + n2;
      raw.push({ prn: m.prn, x: m.x, y: m.y, z: m.z, prM: rho1 });
      modeled.push({ prn: m.prn, x: m.x, y: m.y, z: m.z, prM: m.prM + (1 - st.corr) * I1 + n1 });
      dual.push({ prn: m.prn, x: m.x, y: m.y, z: m.z, prM: w1 * rho1 + w2 * rho2 });
    }
    function hErr(list) {
      var sol = G.solvePosition(list, { guess: { x: rec.x, y: rec.y, z: rec.z } });
      if (!sol.ok) return NaN;
      var e = enuOf(S.lat, S.lon, { x: sol.x - rec.x, y: sol.y - rec.y, z: sol.z - rec.z });
      return Math.hypot(e.e, e.n);
    }
    st.errRaw3 = hErr(raw); st.errModel3 = hErr(modeled); st.errDual3 = hErr(dual);
    st.amp = Math.sqrt(w1 * w1 + w2 * w2);
  }`);
sub('app/70-atm.js', "    st.errRaw = st.curve[0].h;\n    var now = positionError(st.corr);\n    st.errNow = now.h;",
  "    st.errRaw = st.curve[0].h;\n    var now = positionError(st.corr);\n    st.errNow = now.h;\n    if (G.solvePosition) threeWay();");
sub('app/70-atm.js', "    setText('gl-atm-detail', '站点 ' + C.fmt(S.lat, 1)",
  "    var cmp = (isFinite(st.errRaw3) && isFinite(st.errDual3))\n      ? ('三情景同噪声对照（活跃度 ×' + C.fmt(st.activity, 0) + '、σ=' + C.fmt(st.sigma, 1) + ' m）：L1 不改正 ' + C.fmt(st.errRaw3, 2) + ' m ／ L1+模型改正 ' + C.fmt(st.errModel3, 2) + ' m ／ 双频消电离层 ' + C.fmt(st.errDual3, 2) + ' m（组合噪声放大 ' + C.fmt(st.amp, 2) + '×）。')\n      : '';\n    setText('gl-atm-detail', '站点 ' + C.fmt(S.lat, 1)");
sub('app/70-atm.js', "'（计算耗时 ' + st.ms.toFixed(0) + ' ms）。');",
  "'（计算耗时 ' + st.ms.toFixed(0) + ' ms）。' + cmp);");
sub('app/70-atm.js', "      co.addEventListener('input', function () {",
  "      var act = el('gl-atm-act'), sg = el('gl-atm-sig');\n      if (act) { act.value = st.activity; setText('gl-atm-act-val', '×' + st.activity); act.addEventListener('input', function () { st.activity = parseFloat(act.value); setText('gl-atm-act-val', '×' + st.activity); APP.panels.atm.render(); }); }\n      if (sg) { sg.value = st.sigma; setText('gl-atm-sig-val', C.fmt(st.sigma, 1) + ' m'); sg.addEventListener('input', function () { st.sigma = parseFloat(sg.value); setText('gl-atm-sig-val', C.fmt(st.sigma, 1) + ' m'); APP.panels.atm.render(); }); }\n      co.addEventListener('input', function () {");
/* ---- shell：新增两个旋钮 ---- */
sub('shell.html', `      <div class="gl-field">
        <label class="form-label" for="gl-atm-corr">模型改正比例 <span class="tabular-nums" id="gl-atm-corr-val">70%</span></label>`,
`      <div class="gl-field">
        <label class="form-label" for="gl-atm-act">电离层活跃度（α 系数倍数）<span class="tabular-nums" id="gl-atm-act-val">×1</span></label>
        <input class="form-range" type="range" id="gl-atm-act" min="1" max="40" step="1" value="1">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-atm-sig">伪距噪声 σ <span class="tabular-nums" id="gl-atm-sig-val">2.0 m</span></label>
        <input class="form-range" type="range" id="gl-atm-sig" min="0" max="6" step="0.5" value="2">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-atm-corr">模型改正比例 <span class="tabular-nums" id="gl-atm-corr-val">70%</span></label>`);
sub('shell.html', '把改正比例从 0% 拖到 100%，看误差怎么收窄——真实接收机用 Klobuchar 模型大约只能改掉 50–70%。',
  '把改正比例从 0% 拖到 100%，看误差怎么收窄（真实接收机用 Klobuchar 只能改掉 50–70%）。再试「双频消电离层」：L1/L2 组合能把电离层精确消掉（残差 1e-15 m 级），代价是伪距噪声被放大 2.98 倍——所以只有电离层大到超过噪声代价时才划算：把「活跃度」从 ×1 拖到 ×20，看三情景同噪声对照里谁赢。');
