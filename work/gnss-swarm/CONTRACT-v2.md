# 契约增补 v2（2026-10-05）——捕获模块修订、RAIM 粗差检测、多径几何

阅读顺序：本文件 + `CONTRACT.md`（v1 的通用规则 §0 仍然全部有效）。

## 3b. `GNSS.acquire` 修订版

v1 的 `peakRatio` 把**第二阶段精修的峰**与**第一阶段的次峰**混在一起算，导致纯噪声也能报出高比值；
调用方也无法区分"检测到了"和"噪声里的最大值"。修订版要求：

```js
GNSS.acquire(signal, opts) -> {
  ok, reason, detected,
  codePhaseSamples, codePhaseChips, dopplerHz,
  peakMetric, noiseFloor, peakSigma, peakRatio,
  surface, nCode, nDoppler, codeStepSamples, dopplerMinHz, dopplerStepHz,
  ms, usedSamples, elapsedMs
}
```

- `noiseFloor`：由**返回的 surface** 稳健估计，Rayleigh σ ≈ mean(surface)/1.2533141。
- `peakMetric = max(surface)`；`peakSigma = peakMetric / noiseFloor`。
- `peakRatio`：**只能**用 surface 计算，禁止混入精修阶段的值。口径自定但必须写进注释，且满足：
  真实信号（−20 dB、−26 dB）≥ 8；**100 个真实高斯噪声种子全部 < 6**（含回归种子 26）。
- `detected`：−20/−26 dB 真实信号 → true；100 个高斯噪声种子 → 全部 false。建议 `peakSigma ≥ 6.5 && peakRatio ≥ 6`。
- `usedSamples`：实际参与积分的样本数（≤ min(signal.n, i.length, q.length)）。
- **畸形输入必须返回 `{ok:false, reason}`，不得抛异常、不得静默截断**：
  `signal=null`、`i`/`q` 长度不一致、`n<=0`、`fs<=0`、`i[0]` 非有限值。
- `opts.ms > signal.ms` 时按 `signal.ms` 截断并在 `usedSamples` 反映，不要越界读。
- 默认工况（4 ms @ 4.092 MHz、41 个多普勒格）单次调用 < 400 ms；v1 §3 的其余要求（surface 布局、相位/多普勒精度、确定性）继续有效。

## 5. `GNSS.solveRaim`（RAIM 粗差检测与排除）

```js
GNSS.solveRaim(meas, opts) -> {
  ok, reason, x, y, z, clockBias, iterations, residuals, rms, gdop,
  detected, excluded: [{prn, index, normalizedResidual}], mode /* 'ls' | 'excluded' | 'unreliable' */,
  statistics: { maxNormalizedResidual, threshold, n, dof, sigmaHat, normalizedResiduals }
}
```

- 观测数 `n`、自由度 `dof = n - 4`；`n < 6` 时无法排除 → `mode:'unreliable'`、`detected:false`、`ok:false`（数值仍须有限）。
- 残差归一化用**帽子矩阵对角元**：`P = I - G(GᵀG)⁻¹Gᵀ`，`nmr_i = r_i / (sigmaHat · sqrt(P_ii))`，检验量 `max|nmr_i|`。
  **2026-10-05 修订（子代理实测）**：契约原来硬写 `sigmaHat = sqrt(rᵀr/dof)`，该字面口径与「虚警 ≤5% 且 +300 m 检出 ≥85%」**不能同时成立**——
  被污染的 `rᵀr` 会把 σ̂ 抬到 85–121 m，nmr 最大只有 2.2，30 个种子全部漏检。允许并推荐稳健口径：
  用 MAD 预白化定位可疑星、剔除后重解取干净残差，再取 `sigmaHat = min(sqrt(rᵀr/dof), k·sigmaHat_LOO)`（k≈2.5 需注释标定依据），
  并在文件注释里写明口径与实测虚警率/检出率。
- `statistics` 必须描述**做判定那一刻**的完整观测集（排除前）：`n` = 参与判定的观测数、`dof = n − 4`、
  `maxNormalizedResidual` 必须就是与 `threshold` 比较的值（detected=true 时必然 > threshold）、
  `normalizedResiduals` 长度 = n、顺序与 meas 一致、含那个超阈值的坏星（前端柱状图要直接画出来）。
  排除后重解的结果只放 `x/y/z/residuals/rms`。
- `opts.threshold` 默认 5.0（注释说明这是演示口径）。
- 必须满足：① 无粗差、σ=5 m、8 星、100 次蒙特卡洛虚警 ≤5%；
  ② 单颗 +300 m、σ=5 m、8 星、30 个种子 ≥85% 正确排除且排除后三维误差改善 ≥5 倍；
  ③ `n=5` → `unreliable` 且无 NaN；④ 不回归 v1 §4 的全部判据；⑤ 确定性、不修改入参。
- **已知统计盲区（不要试图绕过）**：`n=6`（dof=2）时单个粗差会把 `sqrt(rᵀr/dof)` 一起抬起，
  nmr 对粗差大小近似尺度不变（实测 400 m 与 4000 m 都落在 2 附近），阈值 5.0 永远够不到——
  只要求「返回有限结果、不误排除」，不要求检出。
MD
cat >> CONTRACT-v2.md <<'ENDMD'

## 6. `GNSS.multipath`（镜面多径几何与伪距偏差）

```js
GNSS.rayBlocked(rec, sat, wall) -> boolean
GNSS.reflectPoint(rec, sat, wall) -> { valid, reason, point:{x,y,z}, directPathM, reflectedPathM, pathExtraM, incidenceDeg, reflectionDeg, attenuation }
GNSS.multipathBias(rec, sat, wall, opts) -> { valid, pathExtraM, extraDelayChips, pseudorangeBiasM, directPathM, reflectedPathM, attenuation }
```

- `wall`：`{ point, normal（单位，指向接收机一侧）, along, halfWidthM, zMinM, zMaxM }`。
  墙面是「沿 along 方向 ±halfWidthM、高度 zMinM..zMaxM」的矩形。
  **2026-10-05 歧义修订（A/B 交叉比对发现）**：`zMinM`/`zMaxM` 是**相对 `wall.point` 的高度**，
  沿墙面局部竖直方向 `w`（由 `along × n` 定出并取与 +z 同向的那一支，即竖直墙时 w = 当地真上方向）测量：
  `h(q) = (q - point)·w`。**不要**把 zMinM/zMaxM 当绝对 ECEF z 坐标，也不要直接比较 ECEF 的 z 分量——
  否则纬度 31° 处墙高会错约 14%，甚至让所有卫星都判为“反射点在墙外”（真实 ECEF 坐标量级 6.4e6 m）。
- `reflectPoint`：镜像接收机 `rec' = rec − 2·((rec−point)·n)·n`；反射路径 = `|sat − rec'|`；
  反射点 = 线段 `sat → rec'` 与平面的交点；`pathExtraM = reflectedPathM − directPathM`；
  入射角 = `∠(rec − q, n)`，反射角 = `∠(sat − q, n)`，二者必须相等（容差 1e-9 rad）。
- `valid=false` 的三种情况（各给 reason）：反射点不在矩形内；接收机/卫星不在墙的正面；`rayBlocked` 为真（遮挡优先，不是多径）。
- `multipathBias`：`extraDelayChips = pathExtraM / (c/1.023e6)`；
  `attenuation = clamp01(reflectionCoef)·clamp01(corrLoss)`（默认 0.5 / 1.0）；
  演示用相关器形状模型 `pseudorangeBiasM = pathExtraM · attenuation · exp(−extraDelayChips/1.5)`，
  且 `extraDelayChips > 6` 时强制为 0（超出相关器窗口）。**注释必须写明这是启发式模型，不是物理真值**。
- 必须满足：① 解析算例——墙为平面 x=0、n=(1,0,0)、along=(0,1,0)、halfWidth=10、z∈[0,10]，
  接收机 (5,0,0)、卫星 (30,0,20) → 反射点 (0,0,20/7)、直达 √1025 = 32.015621 m、反射 √1625 = 40.311289 m、
  多出 8.295668 m（容差 1e-6 m），入射角 = 反射角（1e-9 rad）；
  ② 卫星移到墙后 → `rayBlocked=true`；反射点超出 halfWidth/墙高 → `valid=false`；
  ③ 偏差随 `reflectionCoef` 线性、随 `extraDelayChips` 单调递减、`>6 chip` 恰为 0；
  ④ 纯函数、确定性、不修改入参；非法 wall（零法向等）返回 `valid=false` 而不是抛异常。
