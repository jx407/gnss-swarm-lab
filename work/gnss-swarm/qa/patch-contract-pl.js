'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/CONTRACT-v5.md';
let s = fs.readFileSync(p, 'utf8');
const a = '  位置列经 ENU 旋转后取东/北分量得到 `slopeHᵢ = ‖E·A[:,i]‖ / sqrt(Pᵢᵢ)`，垂直 `slopeVᵢ = |U·A[:,i]| / sqrt(Pᵢᵢ)`；';
const n = s.split(a).length - 1;
if (n !== 1) throw new Error('expected 1, got ' + n);
const b = `  位置列经 ENU 旋转后取东/北分量得到斜率。**2026-10-06 修订（子代理实测，很关键）**：
  契约原文与许多教材写 \`slope = ‖E·A[:,i]‖ / sqrt(Pᵢᵢ)\`（对应"归一化残差检验量"），但实测该口径在 200 次蒙特卡洛下
  垂直覆盖率只有 **98.5%**（197/200，最坏比 1.09），打不到下面要求的 ≥99%——因为它保护的是"故障引入的偏差"，不覆盖 H0 下的噪声误差本身。
  允许并推荐改用**经典（Brown/RTCA 型）特征斜率** \`slope = ‖E·A[:,i]‖ / Pᵢᵢ\`（A 实测 100%/100% 达标），
  同时保留 \`hplSimple/vplSimple\` 返回契约字面口径便于对照；两者差异约 1.2–1.7 倍。注释必须写清所用口径；
  **验收以覆盖率门槛为准**（返回的 \`hpl/vpl\` 必须满足覆盖率）。`;
fs.writeFileSync(p, s.split(a).join(b));
console.log('contract §12 revised');
