'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/CONTRACT-v3.md';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 60));
  s = s.split(find).join(rep);
}
/* ① 地磁纬度单位写死（A/B 交叉比对发现 2.92 m 分歧的根源） */
sub('- **电离层（Klobuchar，IS-GPS-200 单频算法）**要点：由接收机大地坐标算地心角 ψ、电离层穿刺点（高度 350 km）的经纬度、',
`- **电离层（Klobuchar，IS-GPS-200 单频算法）**要点：由接收机大地坐标算地心角 ψ、电离层穿刺点（高度 350 km）的经纬度、
  **单位必须与 ICD 一致（这是 2026-10-06 A/B 交叉比对抓到的分歧根源，两版差异达 2.92 m）**：
  ψ = 0.0137/(E+0.11) − 0.022（E 与 ψ 都用**半圆**）；φi = φu/π + ψ·cos(A)（纬度用半圆，A 用弧度），
  并且 **φi 必须限幅到 ±0.416**（否则极区 cos(φi·π)→0 会让 λi 发散出 NaN）；
  λi = λu/π + ψ·sin(A)/cos(φi·π)（λ 用半圆）；
  **φm = φi + 0.064·cos((λi − 1.617)·π)〔半圆〕**，α/β 多项式的自变量就是这个半圆制的 φm；
  t = 4.32e4·λi + tGPS（秒）；`,
);
/* ② P=0 的语义冲突写清楚 */
sub('1. 天顶干延迟在海平面（1013.25 hPa、15 ℃）落在 **2.25–2.35 m**；`P = 0` 时干分量为 0。',
  '1. 天顶干延迟在海平面（1013.25 hPa、15 ℃）落在 **2.25–2.35 m**；`P = 0` 视为非法输入（见下面的非法清单），\n   返回 `valid:false` 且所有延迟字段为 0（早期契约同时写了"P=0 时干分量为 0"与"P≤0 非法"，按本条为准）。');
fs.writeFileSync(p, s);
console.log('contract v3 clarified');
