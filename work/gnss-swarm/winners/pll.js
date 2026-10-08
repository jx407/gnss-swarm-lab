/* Costas 载波跟踪环（二阶 PI 结构）
 * 实现：GNSS.pllTrack(epochs, opts)
 * 作者：独立推导路线 B 版
 * 
 * 环路结构：
 * - 状态机：{ freqRadPerEpoch（积分器，rad/历元）、phi（本振相位，rad）、epochsTracked、slipCount }
 * - 鉴相器（两种模式）：
 *   · 'atan'（默认）：d = atan2(Q, I) —— 相位锁定型 PLL，对 180° 数据位翻转不免疫
 *   · 'costas'：d = I·Q/(I²+Q²) —— Costas 鉴相，对 I 符号不敏感，数据位翻转时 d≈0
 * - PI 环路滤波器：
 *     acc[k] = acc[k-1] + β·d[k]     （积分项，rad/历元）
 *     φ[k] = φ[k-1] + α·d[k] + acc[k]  （比例 + 积分，rad）
 * 
 * 量纲说明：
 * - d（鉴别器输出）：rad（相位误差估计）
 * - α（比例系数）：无量纲（直接作用于相位误差）
 * - β（积分系数）：无量纲（累积到频率积分器）
 * - acc（频率积分器）：rad/历元（每历元的相位增量）
 * - phi（本振相位）：rad（不取模，允许持续累加）
 * 
 * 二阶环与环路阶数：
 * - PI 结构 = 比例路径 + 积分路径 → 二阶环（两个积分器：相位本身 + acc）
 * - 一阶环（β=0）：只有相位积分器，对恒定频差有稳态滞后
 * - 二阶环（β>0）：积分器 acc 累积频差，把匀速相位斜坡的稳态滞后压到接近零
 * - 三阶环需要对 acc 再积分，才能消除多普勒变化率的稳态滞后
 * 
 * Costas 鉴相器的物理意义：
 * - atan2(Q,I) 实际是纯相位误差鉴别器，当信号载波翻转 180°（导航电文比特翻转）时，
 *   I 变号，鉴别器输出跳变 ±π，环路被踢走
 * - Costas 鉴相器 I·Q/(I²+Q²) 对 I 的符号不敏感（I 和 Q 同时变号时乘积不变），
 *   数据位翻转时鉴别器输出 ≈0，环路保持锁定
 */
(function () {
  'use strict';
  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  function pllTrack(epochs, opts) {
    // 入参保护
    if (!epochs || !Array.isArray(epochs) || epochs.length === 0) {
      return { phase: [], freq: [], disc: [], locked: false };
    }
    opts = opts || {};
    var hasOptChips = isFinite(opts.codeChips);
    // 预检查所有 epochs 是否有效（码相位：逐历元优先，缺失时回退 opts.codeChips — CONTRACT-v13 §16.2）
    var hasPerEpoch = true;
    for (var i = 0; i < epochs.length; i++) {
      if (!epochs[i] || !epochs[i].sig || epochs[i].t == null) {
        return { phase: [], freq: [], disc: [], locked: false };
      }
      if (!isFinite(epochs[i].codeChips)) hasPerEpoch = false;
    }
    if (!hasOptChips && !hasPerEpoch) {
      return { phase: [], freq: [], disc: [], locked: false };
    }
    
    var N = epochs.length;
    var codeChips = opts.codeChips;
    var alpha = opts.alpha == null ? 0.4 : opts.alpha;
    var beta = opts.beta == null ? 0.02 : opts.beta;
    var discType = opts.disc || 'atan';  // 'atan' 或 'costas'
    
    // 显式状态机
    var state = {
      phi: opts.phi0 == null ? 0 : opts.phi0,              // 本振相位 (rad)
      freqRadPerEpoch: 0,                                   // 频率积分器 (rad/历元)
      fNco: opts.fNco0 == null ? 0 : opts.fNco0,           // 本振频率 (Hz)
      epochsTracked: 0,
      slipCount: 0
    };
    
    var phase = new Array(N);
    var freq = new Array(N);
    var disc = new Array(N);
    var lockQ = new Array(N);
    
    // 逐历元更新
    for (var e = 0; e < N; e++) {
      var epoch = epochs[e];
      var sig = epoch.sig;
      var t = epoch.t;
      
      // 1. 码相位转换为 correlateIQ 需要的镜像偏移量（逐历元优先）
      var chipsThis = isFinite(epochs[e].codeChips) ? epochs[e].codeChips : codeChips;
      var off = GNSS.chipsToCorrelateOffset(chipsThis, sig.fs);
      
      // 2. 相关运算：使用上一历元的本振相位和频率
      var iq = GNSS.correlateIQ(sig, off, state.fNco, state.phi, sig.ms);
      
      // 3. 鉴相器
      var d;
      if (discType === 'costas') {
        // Costas 鉴相器：d = I·Q/(I²+Q²)
        // 归一化形式，对 I 的符号不敏感
        // 当 I 和 Q 同时变号（180° 翻转）时，I·Q 不变，d 不变
        var I = iq.I, Q = iq.Q;
        var I2Q2 = I * I + Q * Q;
        if (I2Q2 > 0) {
          d = (I * Q) / I2Q2;
        } else {
          d = 0;  // 无信号时输出 0
        }
      } else {
        // 默认 'atan' 鉴相器：d = atan2(Q, I)
        // 相位锁定型，对 180° 数据位翻转不免疫
        d = Math.atan2(iq.Q, iq.I);
      }
      disc[e] = d;
      var _amp = Math.sqrt(iq.I * iq.I + iq.Q * iq.Q);
      lockQ[e] = _amp > 0 ? Math.abs(iq.I) / _amp : 0;
      
      // 4. PI 环路滤波器更新状态
      //    积分路径：acc += β·d
      state.freqRadPerEpoch += beta * d;
      
      //    比例 + 积分：φ += α·d + acc
      state.phi += alpha * d + state.freqRadPerEpoch;
      
      // 注：phi 不取模，允许持续累加（跟踪真实的相位漂移）
      
      // 5. 输出当前历元的相位
      phase[e] = state.phi;
      
      // 6. 计算残余频差（Hz）
      //    freq[e] = (phase[e] - phase[e-1]) / (2π·t)
      if (e === 0) {
        freq[e] = 0;
      } else {
        var dPhi = phase[e] - phase[e - 1];
        freq[e] = dPhi / (2 * Math.PI * t);
      }
      
      state.epochsTracked++;
    }
    
    // 7. 锁定判据（CONTRACT-v14 §16.3）：输出有限 ∧ 后半段 max|disc| ≤ 0.5 ∧ mean(|I|/amp) ≥ 0.8
    //    第二条对 Costas 恒真（|d| = |0.5·sin2Δφ| ≤ 0.5），必须再加"能量在 I 支路"这条，
    //    才能识别失锁（纯噪声 |I|/amp ≈ 0.64）与正交假锁（≈0）。
    var allFinite = phase.every(isFinite) && freq.every(isFinite) && disc.every(isFinite);
    var halfIdx = Math.floor(N / 2);
    var maxDiscSecondHalf = 0, lockQualSum = 0, lockQualN = 0;
    for (var i = halfIdx; i < N; i++) {
      if (Math.abs(disc[i]) > maxDiscSecondHalf) maxDiscSecondHalf = Math.abs(disc[i]);
      lockQualSum += lockQ[i]; lockQualN++;
    }
    var lockQual = lockQualN ? lockQualSum / lockQualN : 0;
    var locked = allFinite && maxDiscSecondHalf <= 0.5 && lockQual >= 0.8;

    return {
      phase: phase,
      freq: freq,
      disc: disc,
      locked: locked,
      lockQual: lockQual,
      maxSteadyDisc: maxDiscSecondHalf
    };
  }

  GNSS.pllTrack = pllTrack;
})();
