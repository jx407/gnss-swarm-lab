# GNSS 蜂群工作台 — 模块接口契约 v1

所有模块都是**零依赖纯 JS**，同一份文件必须能直接在浏览器（`<script>`）和 Node ≥ 18（`require`）中运行。
装载方式固定为全局命名空间：

```js
(function () {
  'use strict';
  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  // ... 实现 ...
  GNSS.caCode = caCode;
})();
```

## 0. 通用硬性规则

- 允许：ES2018 语法、TypedArray、`Math.imul`、闭包、内部缓存（不得有跨调用的可变状态影响结果）。
- 禁止：`import` / `export` / `require` / DOM / Worker / `fetch` / 任何外部依赖 / `Math.random` / 在库文件中 `console.log`。
- 单位一律 SI：米、秒、赫兹、弧度（名字里带 `Deg` / `Hz` / `km` 的除外）。角度输入用「度」，内部换算。
- 纯函数：同一输入必须得到逐位相同输出。
- 除参数明显非法外不要抛异常；失败用 `ok:false` 或 `null` 表达。
- 常量：`c = 299792458` m/s；`mu = 3.986005e14` m³/s²；`OMEGA_E = 7.2921151467e-5` rad/s；
  `F_L1 = 1575.42e6` Hz；`F_CODE = 1.023e6` Hz；`CHIP_LEN = 1023`；`LAMBDA_L1 = c / F_L1`；
  GPS 半长轴取 `A_GPS = 26561750` m（使 2 个轨道周期 ≈ 1 个恒星日 86164.09 s）；倾角 55°。
- 代码质量：数学正确 > 速度 > 简洁。变量名说人话，关键推导写一两行注释。

## 1. `GNSS.caCode` / `GNSS.caChips`（C/A 码发生器）

```js
GNSS.caCode(prn)   // -> Int8Array(1023)，取值只有 +1 / -1，index 0 = 该码第 1 个 chip
GNSS.caChips(prn)  // -> Uint8Array(1023)，取值 0/1，与 caCode 严格对应：chip 0 -> +1，chip 1 -> -1
GNSS.CA_LEN        // -> 1023
```

- `prn` 为整数 1..32；其它输入返回 `null`。
- 结构：G1/G2 两个 10 级最大长度线性反馈移位寄存器（多项式 G1: 1+x³+x¹⁰，G2: 1+x²+x³+x⁶+x⁸+x⁹+x¹⁰），
  G2 按 IS-GPS-200 Table 3-Ia 的抽头对做异或抽头选择，chip = G1_out XOR G2_out，每 chip 输出后两寄存器各推进一次，周期 1023。
- 已知基准：PRN 1 的前 10 个 chip（`caChips(1)` 的前 10 位拼成字符串）必须是 `1100100000` 或其整体取反。
- 必须满足的真实数学性质（会被逐条检验）：
  1. 32 个码互不相同；每个码 ±1 的个数为 512/511。
  2. 循环自相关（未归一化原始和，lag=1..1022）只出现 `63`、`-1`、`-65` 三种值，峰值 1023 只在 lag=0。
  3. 任意两个不同 PRN 的循环互相关，1023 个 lag 上绝对值 ≤ 65。

## 2. `GNSS.ephemeris`（星座与几何 / DOP）

```js
GNSS.ecefFromGeodetic(latDeg, lonDeg, hM)      // -> {x,y,z}  WGS-84
GNSS.geodeticFromEcef(x, y, z)                 // -> {latDeg, lonDeg, hM}
GNSS.satEcef(prn, tSec)                        // -> {x,y,z} 瞬时卫星位置，ECEF，米
GNSS.allSats(tSec)                             // -> [{prn,x,y,z}]  24 颗
GNSS.satVelocity(prn, tSec)                    // -> {x,y,z}  m/s（可用数值微分，步长 0.1 s）
GNSS.lookAngles(rec, sat)                      // rec/sat 为 ECEF 对象 -> {azDeg, elDeg, rangeM}
GNSS.visible(sats, rec, maskDeg)               // -> [{prn, azDeg, elDeg, rangeM, x,y,z}]，按 elDeg 降序
GNSS.dop(sats, rec)                            // -> {ok, gdop, pdop, hdop, vdop, tdop, n}
```

- 星座模型（确定性、可解析）：6 个轨道面，升交点赤经 `RAAN_k = 60°·k`（k=0..5）；每面 4 颗，
  在轨道平面内的纬度幅角 `u = 90°·j + 36°·k`（j=0..3）。**2026-10-05 二次修订**：原用 30°·k（标准 Walker 24/6/2），但该相位在 Δk=3、Δj=1 的卫星对上会让两颗星在同时过交点时**严格重合**（独立复核实测 t=0 时 PRN1/PRN14 距离 0.000 m，可见集里 PRN3/PRN16 天球夹角 0.0000°），使可见星数与 DOP 统计失真；改为 36°/面后全周期最小间距 > 100 km（权威测试新增该判据）。；圆轨道 e=0，a=A_GPS，i=55°。
  （2026-10-05 修订：原契约误写为 `30°·(k mod 2)`，只有两种相位交错，导致中纬度同一时刻可见星偏少（实测仅 5–6 颗，PDOP ≈ 4.9），已改为标准的 Walker 24/6/2。）
  第 `prn-1` 颗按 `k = floor((prn-1)/4)`、`j = (prn-1) mod 4` 取参数。
- 瞬时轨道角 `u(t) = u0 + n·t`，`n = sqrt(mu / a³)`；ECI→ECEF 用 `RAAN_eff = RAAN - OMEGA_E·t`。
  直角坐标转换按标准形式（含倾角旋转）。`tSec` 为自由时间秒数，可为任意实数（含负数）。
- `ecefFromGeodetic` / `geodeticFromEcef` 用 WGS-84（a=6378137, f=1/298.257223563），二者互逆到 1e-6 度 / 1e-3 米。
- `dop`：观测矩阵行 `[-ux, -uy, -uz, 1]`（单位视线向量 u 由接收机指向卫星），`Q = (GᵀG)⁻¹`，
  `GDOP=sqrt(trace Q)`、`PDOP=sqrt(Qxx+Qyy+Qzz)`、`TDOP=sqrt(Qtt)`；
  HDOP/VDOP 必须先把位置子块旋转到当地 ENU 再取对角（ENU 原点为接收机，东/北/天）。
  必须满足 `HDOP² + VDOP² = PDOP²`（相对误差 < 1e-6）与 `GDOP² = PDOP² + TDOP²`。
  卫星数 < 4 或几何奇异（最小奇异值过小）时返回 `{ok:false, n}`，不要返回 NaN/Infinity。

## 3. `GNSS.acquire`（C/A 码二维捕获）

```js
GNSS.acquire(signal, opts) // -> 见下
```

`signal` 由参考实现 `GNSS.makeSignal`（`lib/signal.js`，已提供，直接读它）产生，字段：
`{i:Float32Array, q:Float32Array, fs, ms, n, prn, codePhase(chips, float), dopplerHz, snrDb}`。

信号模型（务必对齐符号约定）：采样时刻 `t_j = j/fs`（j=0..n-1），
`chipIdx(j) = floor(t_j · 1.023e6 + codePhase) mod 1023`，`c_j = caCode(prn)[chipIdx(j)]`，
`i_j = A·c_j·cos(2π·dopplerHz·t_j) + n_i`，`q_j = A·c_j·sin(2π·dopplerHz·t_j) + n_q`。
因此正确混频是乘 `e^{-j2πft}`：`I = i·cos(2πft) + q·sin(2πft)`，`Q = -i·sin(2πft) + q·cos(2πft)`。

`opts`（都有默认值）：
```js
{ dopplerMinHz = -5000, dopplerMaxHz = 5000, dopplerStepHz = 250,
  codeStepSamples = round(fs / 1.023e6),   // 粗搜码相位步长（采样点）
  ms = signal.ms,                          // 使用的积分时长，≤ signal.ms
  refine = true }                          // 粗搜后是否在 1 采样点分辨率上精修
```
返回：
```js
{ ok, codePhaseSamples, codePhaseChips, dopplerHz, peakMetric, peakRatio,
  surface, nCode, nDoppler, codeStepSamples, dopplerMinHz, dopplerStepHz,
  ms, elapsedMs }
```
- `surface` 是 `Float32Array(nDoppler * nCode)`，**行主序**：`surface[d*nCode + c]`，
  行 = 多普勒（从 `dopplerMinHz` 起，步长 `dopplerStepHz`，共 `nDoppler = round((max-min)/step)+1` 行），
  列 = 码相位（从 0 起，步长 `codeStepSamples`，共 `nCode = floor(n / codeStepSamples)` 列）。
  值 = 相干积分幅度 `sqrt(I²+Q²)`（可除以样本数以归一化，但整张图必须同一尺度）。
- `peakRatio` = **检测对比度**，不是原始「峰值/次峰」比值。2026-10-05 修订（两个独立变体都独立发现了同一问题）：41 × 1023 个搜索格里，4 ms 相干积分的 −30 dB 匹配滤波峰只有约 5.7σ，而约 4.2 万个噪声单元的最大值约 4.6σ，**原始峰值/次峰在 −30 dB 的理论下限约 1.2，不可能达到 8**。因此本字段定义为「对噪声底归一化后的对比度」，口径由实现自定（例如 CFAR：以 surface 均值/1.2533 估计 Rayleigh σ 作为噪声底，峰值超出 5.5σ 门限的过剩量与次峰过剩量之比），必须满足：真实信号（−20 dB 及以上）≥ 8、纯噪声 < 6，并在实现文件注释里写明口径。
- 建议同时返回 `noiseFloor`（surface 的稳健 1σ 估计，可选）；可视化端用「峰值/噪声底」换算出「相关峰 ≈ x.xσ」，这是弱信号下唯一有物理意义的读数。
- `codePhaseSamples` 为 0..n-1 的整数（信号采样率下的码起始偏移），`codePhaseChips = codePhaseSamples · 1023 / (fs·0.001)` 只是换算展示。
- 判定标准（会被检验）：`|codePhaseSamples - codePhase·fs/1.023e6|` 在环形意义上 ≤ 4 个采样点；
  `|dopplerHz - signal.dopplerHz| ≤ 1` 个多普勒步长；`-20 dB`（A²/(2σ²)=10^-2）与 `-26 dB` 信噪比下都能成功（2026-10-05 修订：原写 `-30 dB` 经红队实测不成立——4 ms 相干积分的理论峰只有约 5.7σ，而约 4.2 万个噪声格的最大值约 4.6σ，50 个种子只有 3 个能检出；`-30 dB` 及更低只作为可视化里的「边缘检测」演示，不作为验收标准）；
  纯噪声输入 `peakRatio` 明显低于真实信号（真实信号 ≥ 8，噪声 < 6）。
- 单次调用（4 ms @ 4.092 MHz 采样，41 个多普勒格）耗时必须 < 400 ms；粗搜建议先降采样到 1 采样/chip，
  再只用胜出的多普勒格做 1 采样点精修（两阶段），避免 O(nCode²·nDoppler)。

## 4. `GNSS.positioning`（伪距定位最小二乘）

```js
GNSS.simulatePseudoranges(sats, truthEcef, opts)  // -> [{prn,x,y,z,prM,rangeM}]
GNSS.solvePosition(meas, opts)                    // -> 见下
```

- `sats`: `[{prn,x,y,z}]`；`truthEcef`: `{x,y,z}`（接收机真值）；`opts = {clockBiasM = 0, noiseSigmaM = 0, seed = 1}`，
  伪距 = 几何距离 + 钟差（米） + 高斯噪声（每颗独立，用种子 PRNG，Box-Muller）。返回每颗的 `prM`、`rangeM`。
- `meas`: `[{prn,x,y,z,prM}]`；`opts = {guess:{x,y,z}, clockBiasGuess=0, maxIter=20, tolM=1e-4}`。
- 返回：
```js
{ ok, x, y, z, clockBias, iterations, residuals, rms, gdop, converged, reason }
```
  其中 `residuals` 长度等于测量数（观测伪距 − 估计伪距，米），`rms = sqrt(mean(residuals²))`，
  `gdop` 用 GNSS.dop 的口径（可复用或内联）。
- 算法：标准线性化最小二乘（每轮解 `Δ = (GᵀG)⁻¹Gᵀr`，更新 `x,y,z,cdt`，`maxIter` 内收敛即停）。
- 判定标准（会被检验）：
  1. 无噪声 6 星 → 恢复真值，误差 < 0.01 m，迭代 ≤ 15，`converged=true`。
  2. 初值偏离 100 km 仍收敛到同一解。
  3. 噪声 σ=5 m、8 星重复 50 次：三维 RMS 误差 < 5·σ·GDOP，且无 NaN。
  4. 全部卫星聚集在同一方向（病态几何）时返回 `ok:false`，不得出现 NaN/Infinity。
  5. 钟差 3000 m 必须被正确分离出来（误差 < 0.01 m）。
