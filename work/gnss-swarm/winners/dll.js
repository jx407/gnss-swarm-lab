/* GNSS.trackDll — 带环路滤波的码跟踪环（二阶 PI）
 * 契约：CONTRACT-v8.md §14
 * 判据：tests/test-dll.js（23 项检查）
 * 
 * 核心原理：
 * - 早迟门判别器：E/L 各偏 ±0.5 chip，归一化 d=(E-L)/(E+L)
 * - 二阶 PI 环路：acc = beta*(acc+d); g = g + alpha*d + acc
 * - 积分项（beta）把匀速滞后压到接近零，同时扩大牵入范围
 */
(function () {
  'use strict';

  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  var CA_LEN = 1023;

  function trackDll(signals, opts) {
    // 入参校验
    if (!signals || !Array.isArray(signals) || signals.length < 2) {
      return { chips: [], disc: [], locked: false };
    }
    // 检查每个元素是否有效（i/q 可以是 Float32Array 或普通数组）
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      if (!s || !s.i || typeof s.i.length !== 'number' || 
          !s.q || typeof s.q.length !== 'number' || 
          typeof s.fs !== 'number') {
        return { chips: [], disc: [], locked: false };
      }
    }

    var o = opts || {};
    var alpha = o.alpha == null ? 0.4 : o.alpha;
    var beta = o.beta == null ? 0.06 : o.beta;
    var spacingChips = o.spacingChips == null ? 0.5 : o.spacingChips;
    
    var N = signals.length;
    var chips = new Array(N);
    var disc = new Array(N);
    var g = 0;             // 当前估计的码相位（chip）
    var dopplerHz = 0;     // 当前估计的多普勒（Hz）
    var acc = 0;           // 积分器状态（chip）
    var allValid = true;

    // 第 0 历元：初始化
    if (o.init && typeof o.init.chips === 'number' && typeof o.init.dopplerHz === 'number') {
      // 用户注入的初始值
      g = o.init.chips;
      dopplerHz = o.init.dopplerHz;
    } else {
      // 冷启动：用捕获初始化
      if (typeof GNSS.acquire !== 'function') {
        return { chips: [], disc: [], locked: false };
      }
      var acq = GNSS.acquire(signals[0], {});
      if (!acq || !acq.ok || typeof acq.codePhaseSamples !== 'number' || typeof acq.dopplerHz !== 'number') {
        return { chips: [], disc: [], locked: false };
      }
      // codePhaseSamples 是采样单位，需转成 chip（SPC = fs/1.023e6）
      var fs0 = signals[0].fs;
      var spc = fs0 / 1023e3;
      g = acq.codePhaseSamples / spc;
      dopplerHz = acq.dopplerHz;
    }

    // 归一化到 [0, 1023)
    g = ((g % CA_LEN) + CA_LEN) % CA_LEN;
    
    // 输出第 0 历元的初始估计
    chips[0] = g;
    disc[0] = 0;

    // 第 1..N-1 历元：跟踪循环
    for (var e = 1; e < N; e++) {
      var sig = signals[e];
      var fs = sig.fs;
      
      // 早迟门相关（注意镜像约定：chips → correlateOffset）
      var gE = ((g + spacingChips) % CA_LEN + CA_LEN) % CA_LEN;
      var gL = ((g - spacingChips) % CA_LEN + CA_LEN) % CA_LEN;
      var offsetE = GNSS.chipsToCorrelateOffset(gE, fs);
      var offsetL = GNSS.chipsToCorrelateOffset(gL, fs);
      
      /* 优先用 GNSS.codeEnv（生成器约定；带限信号时自动换成**分数延迟复制码**，否则跟踪仍被
         整数样本量化卡在平台上——见 CONTRACT-v21 §22 的 2×2 交叉实验）。没有 codeEnv 时退回 correlateAt。 */
      var E = GNSS.codeEnv ? GNSS.codeEnv(sig, gE, { dopplerHz: dopplerHz, ms: sig.ms })
                           : GNSS.correlateAt(sig, offsetE, dopplerHz, sig.ms);
      var L = GNSS.codeEnv ? GNSS.codeEnv(sig, gL, { dopplerHz: dopplerHz, ms: sig.ms })
                           : GNSS.correlateAt(sig, offsetL, dopplerHz, sig.ms);
      
      // 归一化判别器：d > 0 表示真值在 g 前方
      var sum = E + L;
      var d = (sum > 0) ? (E - L) / sum : 0;
      
      // 检查有效性
      if (!isFinite(d) || Math.abs(d) > 1) {
        allValid = false;
      }
      
      // 二阶 PI 环路滤波
      acc = beta * (acc + d);
      g = g + alpha * d + acc;
      
      // 归一化到 [0, 1023)
      g = ((g % CA_LEN) + CA_LEN) % CA_LEN;
      
      // 检查输出有效性
      if (!isFinite(g) || g < 0 || g >= CA_LEN) {
        allValid = false;
      }
      
      chips[e] = g;
      disc[e] = d;
    }

    // 最终锁定判断：全部输出有限且在范围内
    var locked = allValid;
    for (var i = 0; i < N; i++) {
      if (!isFinite(chips[i]) || chips[i] < 0 || chips[i] >= CA_LEN ||
          !isFinite(disc[i]) || Math.abs(disc[i]) > 1) {
        locked = false;
        break;
      }
    }

    return { chips: chips, disc: disc, locked: locked };
  }

  GNSS.trackDll = trackDll;
})();
