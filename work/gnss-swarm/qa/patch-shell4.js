'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html';
let s = fs.readFileSync(p, 'utf8');
function ins(anchor, html, after) {
  const i = s.indexOf(anchor);
  if (i < 0) throw new Error('anchor missing: ' + anchor.slice(0, 50));
  s = s.slice(0, after ? i + anchor.length : i) + html + s.slice(after ? i + anchor.length : i);
}
/* 新标签按钮：插在 RAIM 之后 */
ins('<button class="nav-link" id="gl-tab-raim" role="tab" aria-controls="gl-panel-raim" aria-selected="false" type="button">RAIM 检核</button>',
  '\n    <button class="nav-link" id="gl-tab-geo" role="tab" aria-controls="gl-panel-geo" aria-selected="false" type="button">全球几何</button>', true);
/* 新面板：插在最后的 </div> 之前 */
const panel = `
  <div id="gl-panel-geo" class="gl-panel" role="tabpanel" aria-labelledby="gl-tab-geo" hidden>
    <div class="viz-grid gl-stats">
      <div class="card viz-stat">
        <div class="text-small text-muted">当前站点 24 h 中位 PDOP</div>
        <div class="viz-stat-value tabular-nums" id="gl-geo-here">—</div>
        <div class="text-small text-muted" id="gl-geo-here-ctx">—</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">最好的站点</div>
        <div class="viz-stat-value tabular-nums" id="gl-geo-best">—</div>
        <div class="text-small text-muted" id="gl-geo-best-ctx">中位 PDOP 最小</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">最差的站点</div>
        <div class="viz-stat-value tabular-nums" id="gl-geo-worst">—</div>
        <div class="text-small text-muted" id="gl-geo-worst-ctx">中位 PDOP 最大</div>
      </div>
    </div>
    <canvas id="gl-geo-canvas" role="img" aria-label="16 个站点 24 小时中位 PDOP 的水平条形图，含 95 分位须线与当前站点参照线"></canvas>
    <p class="text-small text-muted gl-note" id="gl-geo-detail">正在扫描 16 个站点…</p>
    <p class="text-small text-muted gl-read">读法：条形＝24 小时内 PDOP 的中位数，细须＝95 分位（几何最差的那几个历元），右端数字＝中位可见星数。几何主要由纬度与 6 个轨道面的相对相位决定，所以同纬度的城市几乎一样好；把上面星座面板的纬度拖到另一个半球，虚线会跟着动。</p>
  </div>`;
const last = s.lastIndexOf('</div>');
s = s.slice(0, last) + panel + '\n' + s.slice(last);
fs.writeFileSync(p, s);
console.log('shell patched, bytes=' + Buffer.byteLength(s));
