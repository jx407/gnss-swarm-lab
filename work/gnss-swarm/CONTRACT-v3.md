# 契约增补 v3（2026-10-06）——大气延迟（电离层 Klobuchar / 对流层 Saastamoinen）

阅读顺序：本文件 + `CONTRACT.md` §0 通用规则 + `CONTRACT-v2.md`。

## 7. `GNSS.iono` / `GNSS.tropo` / `GNSS.atmosDelay`

目的：让定位误差不再只是白噪声——真实伪距里最大的一项是大气延迟。三个函数都必须可在浏览器与 Node 直接跑。

```js
GNSS.ionoDelay(rec, sat, tGpsSec, opts)      // Klobuchar 单频（L1）电离层延迟
GNSS.tropoDelay(rec, sat, opts)              // Saastamoinen 对流层延迟
GNSS.atmosDelay(rec, sat, tGpsSec, opts)     // 两者之和（给面板用）
```

返回值：
```js
{ valid, reason, elevDeg, azimuthDeg, zenithM, slantM, mapping,
  /* atmosDelay 额外给：*/ ionoM, tropoM, totalM, fHz }
```

- `rec`/`sat`：ECEF（米）。`tGpsSec`：近似为接收时刻的 GPS 周内秒（教学模型允许这一简化，注释写清）。
- `opts`（都有默认值）：
  ```
  { alpha: [1.1176e-8, 0, -5.9605e-8, 0],        // Klobuchar α0..α3（s, s/π, s/π², s/π³）
    beta:  [8.8064e4, 0, -1.9661e5, 0],          // β0..β3（s, s/π, s/π², s/π³）
    fHz: 1575.42e6,                               // 载波频率；电离层按 (f_L1/f)² 缩放
    pressureHpa: 1013.25, tempC: 15, relHumidity: 0.5,
    heightM: 50,                                  // 接收机大地高（对流层天顶延迟要用）
    mapMode: '1/sin' }                            // 也可实现 'marini'，但默认必须与 1/sin 在 1e-9 内一致
  ```
- **电离层（Klobuchar，IS-GPS-200 单频算法）**要点：由接收机大地坐标算地心角 ψ、电离层穿刺点（高度 350 km）的经纬度、
  **单位必须与 ICD 一致（这是 2026-10-06 A/B 交叉比对抓到的分歧根源，两版差异达 2.92 m）**：
  ψ = 0.0137/(E+0.11) − 0.022（E 与 ψ 都用**半圆**）；φi = φu/π + ψ·cos(A)（纬度用半圆，A 用弧度），
  并且 **φi 必须限幅到 ±0.416**（否则极区 cos(φi·π)→0 会让 λi 发散出 NaN）；
  λi = λu/π + ψ·sin(A)/cos(φi·π)（λ 用半圆）；
  **φm = φi + 0.064·cos((λi − 1.617)·π)〔半圆〕**，α/β 多项式的自变量就是这个半圆制的 φm；
  t = 4.32e4·λi + tGPS（秒）；
  穿刺点的地磁纬度 φm、地方时 t；由 α 得振幅 A = Σαₙφmⁿ，由 β 得周期 P = Σβₙφmⁿ（P ≥ 72000 s），
  `x = 2π(t - 50400)/P`；天顶延迟 `dτ = 5e-9 + A(1 - x²/2 + x⁴/24)`（|x| < 1.57），否则 `dτ = 5e-9`；
  斜距因子 `F = 1 + 16(0.53 - E/π)³`（E 为仰角，弧度）；延迟（米）= `F·dτ·c`。
- **对流层（Saastamoinen）**要点：
  天顶干分量 `Zdry = 0.0022768·P / (1 - 0.00266·cos(2φ) - 0.00028·H)`（P：hPa，H：km，m）；
  水汽压 `e = relHumidity·6.11·10^(7.5(T-273.15)/(237.3 + T - 273.15))`（hPa），
  天顶湿分量 `Zwet = 0.002277·(1255/T + 0.05)·e`（m）；斜距 = 天顶 × 映射函数（默认 1/sinE）。
- 仰角 ≤ 0° 或输入非法（缺字段、非有限值、fHz ≤ 0、P ≤ 0 等）→ `valid:false` + `reason`，不抛异常、不返回 NaN。
- 纯函数、确定性、不修改入参。

必须满足（`tests/test-atmos.js` 会逐条检验）：
1. 天顶干延迟在海平面（1013.25 hPa、15 ℃）落在 **2.25–2.35 m**；`P = 0` 视为非法输入（见下面的非法清单），
   返回 `valid:false` 且所有延迟字段为 0（早期契约同时写了"P=0 时干分量为 0"与"P≤0 非法"，按本条为准）。
2. 湿分量随相对湿度单调增；RH=0 时为 0；RH=0.5、15 ℃ 时天顶湿分量 ∈ [0, 0.6] m。
3. 斜距延迟 ≥ 天顶延迟；`slant/zenith` 与映射函数在 1e-9 内一致；仰角 90° 时斜距 = 天顶（1e-6 相对）。
4. 电离层：默认系数下天顶延迟 ∈ [0.5, 40] m；10° 仰角的斜距 ≤ 4× 天顶；随仰角单调减。
5. 频率缩放：`fHz = 1227.60e6`（L2）时电离层延迟 ≈ 1.65×(L1)（用 (1575.42/1227.6)² 精确检验，相对误差 <1e-6）；
   对流层与频率无关。
6. `atmosDelay` = 电离层 + 对流层（1e-9 相对），并且 `totalM` 在 5° 仰角下 ≤ 120 m、在 90° 仰角下 ≤ 20 m（默认参数）。
7. 确定性、入参不被修改、非法输入不抛异常。

## 9. `GNSS.uereSigma` / `GNSS.weightedDop` / `GNSS.solveWeighted`（高程加权最小二乘）

目的：真实接收机不会对所有观测等权——低仰角卫星的噪声、大气残差、多径都大得多（见 §7 的延迟曲线）。
本组函数提供 UERE 权模型与加权最小二乘，**不得修改 `GNSS.solvePosition` 的既有行为**。

```js
GNSS.uereSigma(elevDeg, opts) -> number            // 该仰角下的伪距 1σ（米）
GNSS.weightedDop(sats, rec, sigmas) -> { ok, n, gdop, pdop, hdop, vdop, tdop }
GNSS.solveWeighted(meas, opts) -> { ok, reason, x, y, z, clockBias, iterations, converged,
                                     residuals, rms, weightedRms, gdop, pdop, hdop, vdop, dof, n }
```

- `uereSigma`：`σ(el)² = σz² + (σh/sin el)²`，默认 `opts = { zenithM: 0.5, horizonM: 0.4, elMinDeg: 5 }`；
  `el < elMinDeg` 时按 `elMinDeg` 取值（下限保护）。θ 单调递减、`σ(90°) = sqrt(σz² + σh²)`（容差 1e-9）。
- `weightedDop`：用 `W = diag(1/σᵢ²)` 归一化到平均权重 = 1（即 `w̃ᵢ = (1/σᵢ²)/mean(1/σ²)`），
  `N = GᵀW̃G`，DOP 由 `N⁻¹` 取对角（HDOP/VDOP 仍需把位置子块旋转到当地 ENU）；
  必须满足 `HDOP² + VDOP² = PDOP²`、`GDOP² = PDOP² + TDOP²`（相对误差 <1e-6），奇异返回 `ok:false`。
- `solveWeighted`：`opts = { guess, sigmas | weights, maxIter = 20, tolM = 1e-4 }`；同时接受 `sigmas`（米，内部取 1/σ²）
  或 `weights`（无量纲，等权时与 `solvePosition` 结果必须一致到 1e-9 米）。
  迭代解 `Δ = (GᵀWG)⁻¹GᵀWr`；`weightedRms = sqrt(Σwᵢrᵢ² / Σwᵢ)`；`residuals` 顺序与 `meas` 一致。
  非法输入（非有限值、σ ≤ 0、观测 < 4）→ `ok:false` + reason，不抛异常；纯函数、确定性、不修改入参。
- 必须满足（`tests/test-uwls.js`）：
  1. `sigmas` 全 1 时与 `solvePosition` 的结果一致（< 1e-9 m）。
  2. 加权最优性：`solveWeighted` 返回解的加权代价 ≤ `solvePosition` 返回解在同一权重下的加权代价（严格不得更差）。
  3. 蒙特卡洛（200 次、8 星、真实 σᵢ = uereSigma(elᵢ, {zenithM:0.5, horizonM:1.5})）：
     加权解的三维 RMS 误差比等权解**至少好 10%**。
  4. 明确的 DOP 恒等式；**2026-10-06 修订**：不得要求"降权后加权 PDOP 更小"——DOP 只描述几何，均匀权重才是 (GᵀW̃G)⁻¹ 的最小值点（子代理用独立显式求逆确认，扫 w∝σ^p 最小值恰在 p=0），非均匀仰角权重会让归一化 PDOP 变大（实测 1.99 → 2.42）。加权真正的收益体现在**实际误差**上，因此改为要求：DOP/协方差预测的水平 RMS 与 200 次蒙特卡洛实测吻合（0.7–1.4×），且加权预测误差 < 等权（实测三维 RMS 6.89 m → 5.34 m，改善 22.4%）。
  5. 确定性、入参不被修改、非法输入不抛异常。
