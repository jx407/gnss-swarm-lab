'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 60));
  fs.writeFileSync(file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* 预设按钮：强扰动 + 低噪声（此时双频反超） */
sub('shell.html', `        <label class="form-label" for="gl-atm-corr">模型改正比例 <span class="tabular-nums" id="gl-atm-corr-val">70%</span></label>`,
`        <label class="form-label" for="gl-atm-corr">模型改正比例 <span class="tabular-nums" id="gl-atm-corr-val">70%</span></label>`);
sub('shell.html', `      <div class="gl-field">
        <label class="form-label" for="gl-atm-corr">模型改正比例 <span class="tabular-nums" id="gl-atm-corr-val">70%</span></label>
        <input class="form-range" type="range" id="gl-atm-corr" min="0" max="100" step="5" value="70">
      </div>`,
`      <div class="gl-field">
        <label class="form-label" for="gl-atm-corr">模型改正比例 <span class="tabular-nums" id="gl-atm-corr-val">70%</span></label>
        <input class="form-range" type="range" id="gl-atm-corr" min="0" max="100" step="5" value="70">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-atm-preset">预设：强扰动 + 低噪声</label>
        <button class="btn" id="gl-atm-preset" type="button">看双频反超</button>
      </div>`);
sub('shell.html', '只有电离层大到超过噪声代价时才划算：把「活跃度」从 ×1 拖到 ×20，看三情景同噪声对照里谁赢。',
  '所以只有"模型残差 > 噪声代价"时才划算：活跃度 ×1 时模型改正更好（约 2.9 m vs 8.5 m）；把活跃度拖到 ×20 且 σ 降到 1 m，双频才反超（约 4 m vs 7.7 m）——点右侧预设按钮可以直接看这个拐点。真实接收机正是在强扰动或无模型可用时才切双频。');
sub('app/70-atm.js', "      co.addEventListener('input', function () {",
`      var preset = el('gl-atm-preset');
      if (preset) preset.addEventListener('click', function () {
        st.activity = 20; st.sigma = 1;
        var a2 = el('gl-atm-act'), s2 = el('gl-atm-sig');
        if (a2) a2.value = 20; if (s2) s2.value = 1;
        setText('gl-atm-act-val', '×20'); setText('gl-atm-sig-val', '1.0 m');
        APP.panels.atm.render();
      });
      co.addEventListener('input', function () {`);
