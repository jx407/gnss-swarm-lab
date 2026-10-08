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
/* ① shell：ISB 勾选框 + 读法补充 */
sub('shell.html', `      <div class="gl-field">
        <label class="form-label" for="gl-pos-run">接收机与星座几何面板同源</label>`,
`      <div class="gl-field">
        <label class="form-label" for="gl-pos-isb">多系统时估计系统间钟差（ISB）</label>
        <label class="form-check"><input class="form-check-input" type="checkbox" id="gl-pos-isb" checked><span class="form-check-label">每系统一个钟差未知量</span></label>
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-pos-run">接收机与星座几何面板同源</label>`);
sub('shell.html', '读法：原点是真实位置（切到三系统后可以把「参与解算卫星」拉到 20 以上，几何还能再改善）。伪距噪声按仰角放大',
  '读法：原点是真实位置。切到多系统后请注意：不同 GNSS 系统的系统时不同（ISB），若只用<b>一个</b>接收机钟差去拟合，解会被拉偏；勾上「估计系统间钟差」后每系统各估一个钟差，误差立刻回落——面板会同时给出两个数。（切到三系统后还可以把「参与解算卫星」拉到 20 以上，几何还会更稳。）伪距噪声按仰角放大');
/* ② 40-pos.js：注入 ISB、双解算器、统计里加对照 */
sub('app/40-pos.js', '  function gauss(rnd) {',
`  /* 系统间钟差：多系统时按 MULTI_SYS 的 sysBiasM 注入，真实接收机必须逐系统估钟差 */
  function sysBias(prn) {
    var MS = G.MULTI_SYS;
    if (!MS || !APP.sysOf) return 0;
    var s = APP.sysOf(prn);
    return (MS[s] && Number.isFinite(MS[s].sysBiasM)) ? MS[s].sysBiasM : 0;
  }
  function gauss(rnd) {`);
sub('app/40-pos.js', "          return { prn: m.prn, x: m.x, y: m.y, z: m.z, prM: m.prM + gauss(rnd) * sigmas[i] };",
  "          return { prn: m.prn, sys: APP.sysOf ? APP.sysOf(m.prn) : 'G', x: m.x, y: m.y, z: m.z, prM: m.prM + sysBias(m.prn) + gauss(rnd) * sigmas[i] };");
sub('app/40-pos.js', `        var u = G.solvePosition(noisy, { guess: guess });
        var w = G.solveWeighted ? G.solveWeighted(noisy, { guess: guess, sigmas: sigmas }) : null;`,
`        var multi = (APP.state.systems || ['G']).length > 1;
        var useIsb = st.useIsb && multi && !!G.solveMulti;
        var u = useIsb ? G.solveMulti(noisy, { guess: guess }) : G.solvePosition(noisy, { guess: guess });
        var w = G.solveWeighted ? (useIsb ? G.solveMulti(noisy, { guess: guess, sigmas: sigmas }) : G.solveWeighted(noisy, { guess: guess, sigmas: sigmas })) : null;
        var naive = (useIsb && k < 50) ? G.solvePosition(noisy, { guess: guess }) : null;`);
sub('app/40-pos.js', "        if (u.ok) iters += u.iterations;",
`        if (u.ok) iters += u.iterations;
        if (naive && k === 49) st.lastNaive = { residuals: naive.residuals || [], sats: geo.sats };
        if (naive && naive.ok) { var ne = enu(S0.lat, S0.lon, { x: naive.x - geo.rec.x, y: naive.y - geo.rec.y, z: naive.z - geo.rec.z }); naives.push(Math.hypot(ne.e, ne.n)); }`);
sub('app/40-pos.js', "      var trials = [], iters = 0, pdopW = NaN;", "      var trials = [], iters = 0, pdopW = NaN, naives = [];");
sub('app/40-pos.js', "      st.trials = trials; st.rec = geo.rec; st.sats = geo.sats; st.sigmas = sigmas; st.pool = geo.pool;",
  "      st.trials = trials; st.rec = geo.rec; st.sats = geo.sats; st.sigmas = sigmas; st.pool = geo.pool; st.naiveHrms = rmsOf(naives); st.usedIsb = st.useIsb && (APP.state.systems || ['G']).length > 1 && !!G.solveMulti;");
sub('app/40-pos.js', "      el('gl-pos-run').addEventListener('click', run);",
`      el('gl-pos-run').addEventListener('click', run);
      var isbBox = el('gl-pos-isb');
      if (isbBox) {
        st.useIsb = isbBox.checked;
        isbBox.addEventListener('change', function () { st.useIsb = isbBox.checked; run(); });
      }`);
sub('app/40-pos.js', "      '）；注意 PDOP 反而从 ' + C.fmt(st.pdop, 2) + ' 升到 ' + C.fmt(st.pdopW, 2) +",
  "      (st.usedIsb && isFinite(st.naiveHrms) ? '；不估 ISB 时水平 RMS ' + C.fmt(st.naiveHrms, 2) + ' m，估了 ISB 后 ' + C.fmt(ru, 2) + ' m（改善 ' + C.fmt((1 - ru / Math.max(1e-9, st.naiveHrms)) * 100, 1) + '%）' : '') +\n      '；注意 PDOP 反而从 ' + C.fmt(st.pdop, 2) + ' 升到 ' + C.fmt(st.pdopW, 2) +");
