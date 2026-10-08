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
ins('<button class="nav-link" id="gl-tab-atm" role="tab" aria-controls="gl-panel-atm" aria-selected="false" type="button">误差预算</button>',
  '\n    <button class="nav-link" id="gl-tab-cold" role="tab" aria-controls="gl-panel-cold" aria-selected="false" type="button">冷启动</button>', true);
const panel = `
  <div id="gl-panel-cold" class="gl-panel" role="tabpanel" aria-labelledby="gl-tab-cold" hidden>
    <div class="viz-controls">
      <div class="gl-field">
        <label class="form-label" for="gl-cold-n">参与冷启动的卫星 <span class="tabular-nums" id="gl-cold-n-val">6</span></label>
        <input class="form-range" type="range" id="gl-cold-n" min="4" max="8" step="1" value="6">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-cold-run">逐颗串行搜索（真实计算时间）</label>
        <button class="btn btn-primary" id="gl-cold-run" type="button">执行冷启动</button>
      </div>
    </div>
    <div class="viz-grid gl-stats">
      <div class="card viz-stat">
        <div class="text-small text-muted">累计捕获耗时</div>
        <div class="viz-stat-value tabular-nums" id="gl-cold-time">—</div>
        <div class="text-small text-muted" id="gl-cold-time-ctx">未开始</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">捕获成功</div>
        <div class="viz-stat-value tabular-nums" id="gl-cold-ok">—</div>
        <div class="text-small text-muted" id="gl-cold-ok-ctx">未开始</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">首次定位误差</div>
        <div class="viz-stat-value tabular-nums" id="gl-cold-err">—</div>
        <div class="text-small text-muted" id="gl-cold-err-ctx">未开始</div>
      </div>
    </div>
    <div class="gl-two">
      <canvas id="gl-cold-canvas" role="img" aria-label="每颗卫星的二维捕获耗时条形图，并标注码相位误差、多普勒误差与相关峰信噪比"></canvas>
      <canvas id="gl-cold-ttff" role="img" aria-label="累计耗时阶梯图：横轴为第 n 颗卫星，纵轴为累计毫秒"></canvas>
    </div>
    <p class="text-small text-muted gl-note" id="gl-cold-detail">点「执行冷启动」：逐颗生成中频信号、做二维捕获、精修码相位，再重建伪距并定位。</p>
    <p class="text-small text-muted gl-read">读法：这是**单历元快照**冷启动——每颗星在 41 个多普勒格上做 4 ms 相干积分，串行搜索的真实计算时间就是蓝条长度。码相位精修到亚采样后仍有约 0.3–0.5 码片（≈100 m）的伪距误差，所以快照定位在百米量级；真实接收机靠跟踪环（DLL/PLL）与多历元平滑把码相位精度提升 1–2 个数量级，这也是"30 秒冷启动"能降到"秒级"的关键。整毫秒模糊度这里用粗略位置（±15 km）与粗略钟差先验解开——这正是接收机需要大致位置/时间的原因。</p>
  </div>`;
const last = s.lastIndexOf('</div>');
s = s.slice(0, last) + panel + '\n' + s.slice(last);
fs.writeFileSync(p, s);
console.log('cold panel added, bytes=' + Buffer.byteLength(s));
