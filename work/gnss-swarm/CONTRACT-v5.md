# 契约增补 v5（2026-10-06）——系统间钟差（ISB）感知的多系统定位

阅读顺序：本文件 + `CONTRACT.md` §0 + `CONTRACT-v3.md` §9（加权最小二乘）+ `CONTRACT-v4.md` §10（多系统星座）。
**不得修改** `solvePosition` / `solveWeighted` / `multiconst` 的既有行为。

## 11. `GNSS.solveMulti`（多系统联合解算，逐系统估钟差）

物理背景：不同 GNSS 系统有各自的系统时（GGTO/ISB），一个接收机无法用一个未知钟差同时吸收它们。
真实接收机为**每个系统估一个钟差**（等价于在状态里加 nsys−1 个 ISB 未知量）。

```js
GNSS.solveMulti(meas, opts) -> {
  ok, reason, x, y, z, clockBias,               // clockBias = 参考系统的钟差（米）
  isb: { [sys]: meters },                       // 相对参考系统的系统间钟差（参考系统为 0，不出现在对象的必需项里也可）
  systems: ['G','E',...], nSystems, n, nUnknowns, dof,
  iterations, converged, residuals, rms, weightedRms,
  gdop, pdop, hdop, vdop
}
```

- `meas`：`[{ prn, x, y, z, prM, sys? }]`；缺 `sys` 时按 `String(prn)[0]` 推断（`'G'`/`'E'`/`'C'`），无法识别则视为 `'G'`。
- **参考系统**：若 meas 含 GPS（'G'）则以 G 为参考系，否则取 meas 中首次出现的系统；其余每个系统对应一个额外未知量（ISB，米）。
  （2026-10-06 修订：原文写 "首次出现的系统"，但权威测试的数据经 GNSS.visible() 按仰角排序后首项是 C，与 "ISB(E)=+20、ISB(C)=−35" 的断言矛盾；A/B 两个独立变体都自发选择了 "有 G 用 G"，故以本条为准。）
  `nUnknowns = 4 + (nSystems − 1)`；`dof = n − nUnknowns`。
- 解算：线性化后的设计矩阵每行 = `[−ux, −uy, −uz, 1(参考系) | 第 k 个系统对应列为 1，其余 0]`；
  迭代与收敛判据同 §9；支持 `opts.sigmas` / `opts.weights`（同 §9 的口径，默认等权）。
- 返回的 `gdop/pdop/hdop/vdop` 用**扩展后**的设计矩阵（含 ISB 列）计算；位置子块仍需旋转到当地 ENU；
  必须满足 `HDOP² + VDOP² = PDOP²`、`GDOP² = PDOP² + TDOP²`（这里 TDOP 指参考系钟差那一维；ISB 维只进 GDOP）。
- 单系统时 `nUnknowns = 4`，结果必须与 `solveWeighted`（等权时 `solvePosition`）一致到 1e-6 m。
- 非法输入（观测 < nUnknowns、σ ≤ 0、非有限值、系统数 > 观测数）→ `ok:false` + reason，不抛异常、无 NaN；纯函数、确定性、不修改入参。

必须满足（`tests/test-isb.js`）：
1. 单系统（仅 GPS）时与 `solveWeighted`/`solvePosition` 的差 ≤ 1e-6 m（含钟差）。
2. 三系统、注入 `MULTI_SYS` 给出的 ISB（G 0 / E +20 / C −35 m）、无噪声：**估出的 ISB 与注入值一致到 1e-3 m**，
   位置恢复到 ≤ 1e-3 m；同一批数据用 `solvePosition`（单钟差）则偏 ≥ 2 m —— 说明 ISB 必须估。
3. 含噪（σ=5 m）200 次蒙特卡洛：ISB 感知解的**三维 RMS 比单钟差解至少好 20%**。
4. 扩展 DOP：满足两条恒等式；且 `PDOP_multi ≥ PDOP_4未知数`（多加未知量不可能改善几何）。
5. 两系统情形（G+E）同样能估出 ISB；只有 GPS 星时退化为 4 未知量。
6. 健壮性：观测数 < nUnknowns → `ok:false`；某个系统仅 1 颗星时仍返回有限值（可为 `ok:false` 若秩亏，但不得 NaN）；
   确定性、入参不被修改、非法输入不抛异常。

## 12. `GNSS.protectionLevels`（RAIM 保护限级 HPL / VPL）

目的：RAIM 不只回答"有没有粗差"，还要给出**保护限级**——在当前几何与噪声水平下，真实位置误差不超过的界。
本函数只新增 `GNSS.protectionLevels`，不得改动其它函数。

```js
GNSS.protectionLevels(meas, opts) -> {
  ok, reason,
  hpl, vpl,                       // 水平 / 垂直保护限级（米）
  threshold, sigmaHat,            // 检测门限（默认 5.0）与尺度估计（米）
  n, dof, nSat,
  maxSlopeH, maxSlopeV, worstPrn, // 最差斜率的卫星
  mode                            // 'ok' | 'unreliable'
}
```

- 解算口径与 §9/§11 一致：观测可选 `opts.sigmas`/`opts.weights`（默认等权），状态 `[x,y,z,c·dt]`（**不含** ISB，多系统请先用 §11 或把 ISB 已校正后传入）。
- `sigmaHat`：若 `opts.sigma0`（米）给出则用它（先验噪声，推荐）；否则用后验 `sqrt(Σw rᵢ²/dof)`。**必须把所用口径写在返回值/注释里**。
- 斜率（slope-based RAIM，简化式）：
  `A = (GᵀWG)⁻¹GᵀW`（4×n），帽子矩阵对角 `hᵢᵢ = (G A)ᵢᵢ`，`Pᵢᵢ = 1 − hᵢᵢ`；
  位置列经 ENU 旋转后取东/北分量得到斜率。**2026-10-06 修订（子代理实测，很关键）**：
  契约原文与许多教材写 `slope = ‖E·A[:,i]‖ / sqrt(Pᵢᵢ)`（对应"归一化残差检验量"），但实测该口径在 200 次蒙特卡洛下
  垂直覆盖率只有 **98.5%**（197/200，最坏比 1.09），打不到下面要求的 ≥99%——因为它保护的是"故障引入的偏差"，不覆盖 H0 下的噪声误差本身。
  允许并推荐改用**经典（Brown/RTCA 型）特征斜率** `slope = ‖E·A[:,i]‖ / Pᵢᵢ`（A 实测 100%/100% 达标），
  同时保留 `hplSimple/vplSimple` 返回契约字面口径便于对照；两者差异约 1.2–1.7 倍。注释必须写清所用口径；
  **验收以覆盖率门槛为准**（返回的 `hpl/vpl` 必须满足覆盖率）。
  `HPL = maxᵢ(slopeHᵢ) · threshold · sigmaHat`，`VPL = maxᵢ(slopeVᵢ) · threshold · sigmaHat`。
  （注释里必须写明这是**简化式**：完整 RTCA 版本的门限要用 P_fa/P_md 反推非中心参数 λ，这里用检测门限 `threshold` 近似。）
- `n < 4` 或 Pᵢᵢ ≤ 0 或矩阵奇异 → `ok:false` + reason（`mode:'unreliable'`），数值仍有限、无 NaN；纯函数、确定性、不修改入参。

必须满足（`tests/test-hpl.js`）：
1. 有效几何（8 星以上）返回 `ok:true`、`hpl>0`、`vpl>0`、`vpl>hpl`（GPS 类几何下垂直通常更差）。
2. 尺度线性：`sigma0` 加倍 → HPL/VPL 各自加倍（相对误差 <1%）；`threshold` 加倍 → 同样加倍。
3. 几何改善：三系统（GPS+Galileo+BeiDou）的 HPL 与 VPL 均 < GPS-only 的对应值（卫星更多、几何更好）。
4. 覆盖率（保护的本质）：纯噪声（σ=5 m）200 次蒙特卡洛，实测水平误差 ≤ HPL 的比例 ≥ 99%，垂直误差 ≤ VPL 的比例 ≥ 99%。
5. 观测 < 4 → `ok:false` 且无 NaN；确定性；入参不被修改。
