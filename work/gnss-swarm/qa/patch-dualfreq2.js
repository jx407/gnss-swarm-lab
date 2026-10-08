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
sub('app/70-atm.js', "+ ' m（计算耗时 ' + st.ms.toFixed(0) + ' ms）。');", "+ ' m（计算耗时 ' + st.ms.toFixed(0) + ' ms）。' + cmp);");
sub('app/70-atm.js', "      co.addEventListener('input', function () {",
`      var act = el('gl-atm-act'), sg = el('gl-atm-sig');
      if (act) { act.value = st.activity; setText('gl-atm-act-val', '×' + st.activity); act.addEventListener('input', function () { st.activity = parseFloat(act.value); setText('gl-atm-act-val', '×' + st.activity); APP.panels.atm.render(); }); }
      if (sg) { sg.value = st.sigma; setText('gl-atm-sig-val', C.fmt(st.sigma, 1) + ' m'); sg.addEventListener('input', function () { st.sigma = parseFloat(sg.value); setText('gl-atm-sig-val', C.fmt(st.sigma, 1) + ' m'); APP.panels.atm.render(); }); }
      co.addEventListener('input', function () {`);
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
  '把改正比例从 0% 拖到 100%，看误差怎么收窄（Klobuchar 大约只能改掉 50–70%）。再试双频消电离层：L1/L2 组合能把电离层精确消掉（残差 1e-15 m 级），代价是伪距噪声放大 2.98 倍——只有电离层大到超过噪声代价时才划算：把「活跃度」从 ×1 拖到 ×20，看三情景同噪声对照里谁赢。');
