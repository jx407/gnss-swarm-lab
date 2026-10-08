'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html';
let s = fs.readFileSync(p, 'utf8');
function ins(anchor, html, after) {
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error('anchor missing: ' + anchor.slice(0, 60));
  const at = after ? i + anchor.length : i;
  s = s.slice(0, at) + html + s.slice(at);
}
/* 1) 新标签：误差预算 */
ins('<button class="nav-link" id="gl-tab-geo" role="tab" aria-controls="gl-panel-geo" aria-selected="false" type="button">全球几何</button>',
  '\n    <button class="nav-link" id="gl-tab-atm" role="tab" aria-controls="gl-panel-atm" aria-selected="false" type="button">误差预算</button>', true);
/* 2) 星座面板：键盘可选的卫星下拉（可访问性） */
ins('        <label class="form-label" for="gl-hours">历元 t0+ <span class="tabular-nums" id="gl-hours-val">0.0 h</span></label>\n        <input class="form-range" type="range" id="gl-hours" min="0" max="24" step="0.25" value="0">\n      </div>',
  '\n      <div class="gl-field">\n        <label class="form-label" for="gl-sky-prn">选中卫星（键盘可选，等价于点星图）</label>\n        <select class="form-select" id="gl-sky-prn"></select>\n      </div>', true);
/* 3) 新面板：误差预算 / 大气延迟 */
const panel = `
  <div id="gl-panel-atm" class="gl-panel" role="tabpanel" aria-labelledby="gl-tab-atm" hidden>
    <div class="viz-controls">
      <div class="gl-field">
        <label class="form-label" for="gl-atm-freq">载波</label>
        <select class="form-select" id="gl-atm-freq">
          <option value="1575.42">L1 1575.42 MHz</option>
          <option value="1227.60">L2 1227.60 MHz</option>
        </select>
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-atm-rh">相对湿度 <span class="tabular-nums" id="gl-atm-rh-val">50%</span></label>
        <input class="form-range" type="range" id="gl-atm-rh" min="0" max="100" step="5" value="50">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-atm-corr">模型改正比例 <span class="tabular-nums" id="gl-atm-corr-val">70%</span></label>
        <input class="form-range" type="range" id="gl-atm-corr" min="0" max="100" step="5" value="70">
      </div>
    </div>
    <div class="viz-grid gl-stats">
      <div class="card viz-stat">
        <div class="text-small text-muted">天顶总延迟</div>
        <div class="viz-stat-value tabular-nums" id="gl-atm-zen">—</div>
        <div class="text-small text-muted" id="gl-atm-zen-ctx">电离层 + 对流层</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">最低仰角卫星的总延迟</div>
        <div class="viz-stat-value tabular-nums" id="gl-atm-low">—</div>
        <div class="text-small text-muted" id="gl-atm-low-ctx">—</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">未改正的水平误差</div>
        <div class="viz-stat-value tabular-nums" id="gl-atm-err">—</div>
        <div class="text-small text-muted" id="gl-atm-err-ctx">改正后 —</div>
      </div>
    </div>
    <div class="gl-two">
      <canvas id="gl-atm-canvas" role="img" aria-label="大气延迟随仰角变化：电离层、对流层与合计三条曲线，并标出当前参与解算卫星的仰角"></canvas>
      <canvas id="gl-atm-err-canvas" role="img" aria-label="水平位置误差随模型改正比例变化的曲线，0% 表示完全不改正"></canvas>
    </div>
    <p class="text-small text-muted gl-note" id="gl-atm-detail">正在计算…</p>
    <p class="text-small text-muted gl-read">读法：低仰角卫星的延迟可达天顶的 3–4 倍（电离层与对流层都按 1/sinE 型映射），所以"哪几颗星低"直接决定误差大小；但所有卫星<strong>共同</strong>的那部分延迟会被接收机钟差当成"钟快了"吸收掉，真正让位置跑偏的是各方向延迟的不一致（通常几米）。把改正比例从 0% 拖到 100%，看误差怎么收窄——真实接收机用 Klobuchar 模型大约只能改掉 50–70%。</p>
  </div>`;
const last = s.lastIndexOf('</div>');
s = s.slice(0, last) + panel + '\n' + s.slice(last);
fs.writeFileSync(p, s);
console.log('shell v5 patched, bytes=' + Buffer.byteLength(s));
