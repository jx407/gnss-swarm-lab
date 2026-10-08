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
/* 1) 新增两个标签按钮 */
ins('    <button class="nav-link" id="gl-tab-pos" role="tab" aria-controls="gl-panel-pos" aria-selected="false" type="button">定位解算</button>',
  '\n    <button class="nav-link" id="gl-tab-mp" role="tab" aria-controls="gl-panel-mp" aria-selected="false" type="button">多径与遮挡</button>\n    <button class="nav-link" id="gl-tab-raim" role="tab" aria-controls="gl-panel-raim" aria-selected="false" type="button">RAIM 检核</button>', true);
/* 2) 星座面板：多普勒曲线 + 联动按钮 */
ins('    <p class="text-small text-muted gl-read">读法：实心点高于掩膜',
  '\n    <canvas id="gl-doppler-canvas" role="img" aria-label="所选卫星 24 小时内相对接收机的多普勒频移曲线，横轴为小时，纵轴为赫兹"></canvas>\n    <div class="viz-controls">\n      <div class="gl-field">\n        <label class="form-label" for="gl-dop-to-acq">把选中卫星此刻的多普勒送进捕获面板</label>\n        <button class="btn" id="gl-dop-to-acq" type="button">填入真实多普勒</button>\n      </div>\n    </div>', false);
/* 3) 两个新面板（插在最后的 </div> 之前） */
const panels = `
  <div id="gl-panel-mp" class="gl-panel" role="tabpanel" aria-labelledby="gl-tab-mp" hidden>
    <div class="viz-controls">
      <div class="gl-field">
        <label class="form-label" for="gl-mp-prn">被反射的卫星</label>
        <select class="form-select" id="gl-mp-prn"></select>
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-mp-dist">接收机到墙 <span class="tabular-nums" id="gl-mp-dist-val">12 m</span></label>
        <input class="form-range" type="range" id="gl-mp-dist" min="2" max="120" step="1" value="12">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-mp-height">墙高 <span class="tabular-nums" id="gl-mp-height-val">25 m</span></label>
        <input class="form-range" type="range" id="gl-mp-height" min="2" max="120" step="1" value="25">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-mp-refl">反射系数 <span class="tabular-nums" id="gl-mp-refl-val">0.50</span></label>
        <input class="form-range" type="range" id="gl-mp-refl" min="0" max="0.9" step="0.05" value="0.5">
      </div>
    </div>
    <div class="viz-grid gl-stats">
      <div class="card viz-stat">
        <div class="text-small text-muted">多出路径</div>
        <div class="viz-stat-value tabular-nums" id="gl-mp-extra">—</div>
        <div class="text-small text-muted" id="gl-mp-extra-ctx">反射 − 直达</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">伪距偏差</div>
        <div class="viz-stat-value tabular-nums" id="gl-mp-bias">—</div>
        <div class="text-small text-muted" id="gl-mp-bias-ctx">相关器模型</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">引起的水平误差</div>
        <div class="viz-stat-value tabular-nums" id="gl-mp-err">—</div>
        <div class="text-small text-muted" id="gl-mp-err-ctx">把偏差喂进最小二乘</div>
      </div>
    </div>
    <div class="gl-two">
      <canvas id="gl-mp-canvas" role="img" aria-label="多径侧视图：墙、接收机、卫星、直达射线与经墙反射的射线及反射点"></canvas>
      <canvas id="gl-mp-curve" role="img" aria-label="伪距偏差随接收机到墙距离变化的曲线，当前距离处有标记"></canvas>
    </div>
    <p class="text-small text-muted gl-note" id="gl-mp-detail">调墙距与墙高，看反射路径何时被切断。</p>
    <p class="text-small text-muted gl-read">读法：多出路径 = 反射路径 − 直达路径；相关器只在自己 ±1 chip（≈293 m 的 1/10）窗口内跟踪，所以延迟越长、偏差越小，超过 6 chip 基本无影响。城市里这颗星会被它自己的反射"骗"出几米到几十米的位置误差。</p>
  </div>

  <div id="gl-panel-raim" class="gl-panel" role="tabpanel" aria-labelledby="gl-tab-raim" hidden>
    <div class="viz-controls">
      <div class="gl-field">
        <label class="form-label" for="gl-raim-prn">注入粗差的卫星</label>
        <select class="form-select" id="gl-raim-prn"></select>
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-raim-bias">粗差大小 <span class="tabular-nums" id="gl-raim-bias-val">300 m</span></label>
        <input class="form-range" type="range" id="gl-raim-bias" min="0" max="600" step="10" value="300">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-raim-sigma">伪距噪声 σ <span class="tabular-nums" id="gl-raim-sigma-val">5.0 m</span></label>
        <input class="form-range" type="range" id="gl-raim-sigma" min="0.5" max="12" step="0.5" value="5">
      </div>
      <div class="gl-field">
        <label class="form-label" for="gl-raim-run">20 次蒙特卡洛</label>
        <button class="btn btn-primary" id="gl-raim-run" type="button">运行检核</button>
      </div>
    </div>
    <div class="viz-grid gl-stats">
      <div class="card viz-stat">
        <div class="text-small text-muted">检出并正确排除</div>
        <div class="viz-stat-value tabular-nums" id="gl-raim-det">—</div>
        <div class="text-small text-muted" id="gl-raim-det-ctx">/ 20 次</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">普通 LS 水平误差</div>
        <div class="viz-stat-value tabular-nums" id="gl-raim-plain">—</div>
        <div class="text-small text-muted">中位数</div>
      </div>
      <div class="card viz-stat">
        <div class="text-small text-muted">RAIM 后水平误差</div>
        <div class="viz-stat-value tabular-nums" id="gl-raim-after">—</div>
        <div class="text-small text-muted" id="gl-raim-after-ctx">中位数</div>
      </div>
    </div>
    <div class="gl-two">
      <canvas id="gl-raim-resid" role="img" aria-label="归一化残差条形图：每颗卫星一根，横线为检测阈值"></canvas>
      <canvas id="gl-raim-scatter" role="img" aria-label="东-北误差散点：空心点为普通最小二乘解，实心点为 RAIM 排除后解"></canvas>
    </div>
    <p class="text-small text-muted gl-note" id="gl-raim-detail">调粗差大小，看它多大才被检出来。</p>
    <p class="text-small text-muted gl-read">读法：RAIM 用冗余观测"投票"——把残差按各自权重归一化后，超过阈值的那颗最可疑，剔除后重解。粗差小于噪声水平时检不出来（这是几何与冗余决定的探测下限），面板里能直接看到这个门限在哪里。</p>
  </div>`;
const last = s.lastIndexOf('</div>');
s = s.slice(0, last) + panels + '\n' + s.slice(last);
fs.writeFileSync(p, s);
console.log('shell patched, bytes=' + Buffer.byteLength(s));
