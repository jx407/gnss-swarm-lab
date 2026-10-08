'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 70));
  s = s.split(find).join(rep);
}
/* 定位面板三张卡：等权水平 RMS / 高程加权水平 RMS / PDOP 对照 */
sub(`      <div class="card viz-stat">
        <div class="text-small text-muted">水平 RMS</div>
        <div class="viz-stat-value tabular-nums" id="gl-pos-hrms">—</div>
        <div class="text-small text-muted">50 次蒙特卡洛</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">三维 RMS</div>
        <div class="viz-stat-value tabular-nums" id="gl-pos-3rms">—</div>
        <div class="text-small text-muted">含高程分量</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">GDOP / 卫星数</div>
        <div class="viz-stat-value tabular-nums" id="gl-pos-gdop">—</div>
        <div class="text-small text-muted" id="gl-pos-gdop-ctx">几何构型</div>
      </div>`,
`      <div class="card viz-stat">
        <div class="text-small text-muted">水平 RMS（等权）</div>
        <div class="viz-stat-value tabular-nums" id="gl-pos-hrms">—</div>
        <div class="text-small text-muted" id="gl-pos-3rms">含高程分量 —</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">水平 RMS（高程加权）</div>
        <div class="viz-stat-value tabular-nums" id="gl-pos-hrms-w">—</div>
        <div class="text-small text-muted" id="gl-pos-hrms-w-ctx">按 uereSigma 降权</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">PDOP 等权 → 加权</div>
        <div class="viz-stat-value tabular-nums" id="gl-pos-gdop">—</div>
        <div class="text-small text-muted" id="gl-pos-gdop-ctx">几何构型</div>
      </div>`);
fs.writeFileSync(p, s);
console.log('pos cards patched');
