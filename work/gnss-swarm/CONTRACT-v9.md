# 契约增补 v9（2026-10-06）——§15 导航滤波器（8 维 CV 卡尔曼）

阅读顺序：本文件 + `CONTRACT.md` §0。**不得修改**既有函数。

## §15 `GNSS.navFilter(epochs, opts)`

```js
GNSS.navFilter(epochs, opts) -> { x, P, series, degraded, usedLS }
```

- `epochs`：`[{ t, meas: [{ sat: {x,y,z}, prM }] }]`。`t` 是**相对上一历元**的秒数（首历元缺省按 1 s）。
  `prM` 是伪距（米），不含任何"真值"字段——实现不得读取 `epochs[e].truth` 之类的外部真值。
- 状态 8 维：`[x, y, z, clk, vx, vy, vz, clkRate]`（位置 m、钟差 m、速度 m/s、钟漂 m/s）。
- `opts`：
  - `x0`：长度 8 的数组；**缺省时**用 `GNSS.solvePosition(...)` 的位置+钟差初始化，
    速度与钟漂置 0，并把 `usedLS = true`。
    ⚠️ 注意格式差异：本模块的历元测量是 `{sat:{x,y,z}, prM}`，而 `GNSS.solvePosition` 吃的是**扁平**
    `{x,y,z,prM}`，默认初始化时必须先摊平（踩过：不摊平会得到 `ok:false, reason:'non-finite measurement data'`）。
  - `P0`：8×8 数组；缺省 = `diag(1e8, 1e8, 1e8, 1e8, 100, 100, 100, 1)`（位置/钟差 σ=1e4 m，速度 σ=10 m/s，钟漂 σ=1 m/s）。
  - `sigmaAcc`（默认 0.5 m/s²）、`sigmaClkAcc`（默认 1 m/s²）、`sigmaPr`（默认 30 m）。
- **预测**（标准 CV 离散化，`dt = t`）：
  `F = I`，位置-速度块 `F[0..2][4..6] = dt`，`F[3][7] = dt`；
  `Q` 的每个位置-速度块 = `σa²·[[dt³/3, dt²/2],[dt²/2, dt]]`（钟差-钟漂块同构，用 `σclk²`）。
  `x = F·x`，`P = F·P·Fᵀ + Q`。
- **量测更新**：对每颗星 `u = (s − p)/|s − p|`，`H = [−u, 1, 0, 0, 0, 0]`（8 列），
  新息 `z = prM − (|s − p| + clk)`；`R = σpr²·I`；
  `K = P·Hᵀ·(H·P·Hᵀ + R)⁻¹`，`x ← x + K·z`，`P ← (I − K·H)·P`，最后强制 `P` 对称。
- **观测不足**：`meas.length < 4` 时只做预测，该历元 `degraded: true`（不抛异常、不产生 NaN）。
- 返回：`series[e] = { t, x, P, n, degraded }`；`x`/`P` 为**最终历元**的状态与协方差；
  `degraded` 为布尔（任一历元降级即 true）。
- 纯函数、确定性、不修改 `epochs`/`opts`；非法输入（非数组、空数组、元素缺 `meas`）返回
  `{ x: null, P: null, series: [], degraded: true, usedLS: false }`。
- ES5 兼容（`var`/`function`），中文注释写明状态定义、单位与协方差是"给谁用的"（NEES 检验）。

### 为什么单独做一致性判据
"滤波后误差变小"很容易做到——把过程噪声调小、滤波过度自信，误差曲线照样好看，但协方差会撒谎。
所以 `tests/test-navfilter.js` 除了比较 RMS，还做 **NEES 检验**：对 40 组独立噪声样本，
统计 `e_posᵀ·P_pos⁻¹·e_pos` 的均值（3 自由度理论值 = 3）与 95% 置信椭球覆盖率（理论 95%）。
参考实测（原型 `review/proto-kf.js`）：静态 GPS-only LS 84.8 m → KF 40.3 m（2.11×），
NEES 2.88、覆盖率 95.8%；三系统 31.4 → 17.7 m；动态 5 m/s 84.8 → 40.2 m。
协方差标定错了，这两个数就会同时跑偏。
