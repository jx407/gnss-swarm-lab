/* 双频消电离层组合（B 版，独立推导路线）
 * 竞标：CONTRACT-v12.md §18，判据：tests/test-ionofree.js（17 项）
 *
 * == 从观测方程推导消电离层条件 ==
 * 两频伪距观测方程：
 *   pr1 = R + I           ... (1) 频率 f1，电离层延迟为 I
 *   pr2 = R + k·I         ... (2) 频率 f2，电离层延迟 = k·I（k = (f1/f2)²）
 * 
 * 其中 R = 几何距离 + 卫星钟差 + 接收机钟差 + 对流层延迟等**两频相同**的项。
 * 电离层延迟与频率平方成反比：I_f ∝ 1/f²，故 I2 = I1·(f1/f2)² = k·I1。
 *
 * 目标：构造线性组合 IF = α·pr1 + β·pr2，使其满足：
 *   (a) 电离层被精确消掉：对任意 I，IF 中不含 I 项
 *   (b) 共同项 R 原样保留：IF 中 R 的系数 = 1
 *
 * 将 (1)(2) 代入组合：
 *   IF = α·(R + I) + β·(R + k·I)
 *      = (α + β)·R + (α + k·β)·I
 *
 * 要求对任意 R、I 成立 IF = R，则必须：
 *   { α + β = 1        ... 共同项系数 = 1
 *   { α + k·β = 0      ... 电离层系数 = 0
 *
 * 解这个二元一次方程组：
 *   从第二式：α = -k·β
 *   代入第一式：-k·β + β = 1  →  β·(1 - k) = 1  →  β = 1/(1 - k) = -1/(k - 1)
 *   回代：α = -k·β = -k·(-1/(k-1)) = k/(k - 1)
 *
 * 因此消电离层组合的权重为：
 *   w1 = k/(k - 1)
 *   w2 = -1/(k - 1)
 * 其中 k = (f1/f2)²。
 *
 * == 噪声放大 ==
 * 假设两频观测噪声独立且等方差（σ1 = σ2 = σ），组合后的方差：
 *   Var(IF) = w1²·σ² + w2²·σ² = (w1² + w2²)·σ²
 * 噪声放大倍数：
 *   amp = sqrt(w1² + w2²) = sqrt((k/(k-1))² + (1/(k-1))²)
 *       = sqrt((k² + 1)/(k-1)²) = sqrt(k² + 1) / |k - 1|
 * 
 * 对于 GPS L1/L2（f1=1575.42 MHz, f2=1227.60 MHz）：
 *   k = (1575.42/1227.60)² ≈ 1.646944
 *   w1 ≈ 2.545728, w2 ≈ -1.545728
 *   amp ≈ 2.978255
 *
 * == 实现说明 ==
 * - 纯函数、ES5 兼容、不抛异常（非法输入返回 NaN / ok=false）
 * - 中文注释（契约要求）
 */
(function () {
  'use strict';
  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  /* 计算双频消电离层组合的权重和噪声放大
   * @param {number} f1Hz - 第一频点（Hz）
   * @param {number} f2Hz - 第二频点（Hz）
   * @returns {object} { k, w1, w2, amp, ok }
   *   - k: 频率平方比 (f1/f2)²
   *   - w1, w2: 线性组合权重
   *   - amp: 噪声放大倍数（等噪声假设）
   *   - ok: 输入有效性标志
   */
  GNSS.ionoFreeWeights = function (f1Hz, f2Hz) {
    /* 输入校验：必须为有限正数且不相等 */
    if (!isFinite(f1Hz) || !isFinite(f2Hz) ||
        f1Hz <= 0 || f2Hz <= 0 || f1Hz === f2Hz) {
      return { k: NaN, w1: NaN, w2: NaN, amp: NaN, ok: false };
    }

    var k = (f1Hz / f2Hz) * (f1Hz / f2Hz);  /* k = (f1/f2)² */
    var w1 = k / (k - 1);                   /* 从推导：α = k/(k-1) */
    var w2 = -1 / (k - 1);                  /* 从推导：β = -1/(k-1) */
    
    /* 噪声放大：sqrt(w1² + w2²) = sqrt(k² + 1) / (k - 1) */
    var amp = Math.sqrt(w1 * w1 + w2 * w2);

    return { k: k, w1: w1, w2: w2, amp: amp, ok: true };
  };

  /* 计算双频消电离层组合值
   * @param {number} pr1 - 频率 f1 的伪距观测（米）
   * @param {number} pr2 - 频率 f2 的伪距观测（米）
   * @param {number} f1Hz - 第一频点（Hz）
   * @param {number} f2Hz - 第二频点（Hz）
   * @returns {number} 消电离层组合值（米），非法输入返回 NaN
   */
  GNSS.ionoFree = function (pr1, pr2, f1Hz, f2Hz) {
    /* 输入校验 */
    if (!isFinite(pr1) || !isFinite(pr2)) {
      return NaN;
    }

    var w = GNSS.ionoFreeWeights(f1Hz, f2Hz);
    if (!w.ok) {
      return NaN;
    }

    /* IF = w1·pr1 + w2·pr2 */
    return w.w1 * pr1 + w.w2 * pr2;
  };

  /* 计算双频消电离层组合的噪声放大倍数
   * @param {number} f1Hz - 第一频点（Hz）
   * @param {number} f2Hz - 第二频点（Hz）
   * @returns {number} 噪声放大倍数，非法输入返回 NaN
   */
  GNSS.ionoFreeNoiseAmp = function (f1Hz, f2Hz) {
    var w = GNSS.ionoFreeWeights(f1Hz, f2Hz);
    return w.amp;  /* 非法时已是 NaN */
  };
})();
