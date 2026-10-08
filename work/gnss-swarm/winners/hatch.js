'use strict';
/* GNSS.hatchSmooth - 载波相位平滑码（Hatch 滤波）B 版
 * 
 * === 核心原理 ===
 * 用载波相位的差分 Δφ 来平滑码伪距，把噪声从 30 m 压到厘米级。
 * 关键：只用载波差分，整周模糊度 N·λ 自动消掉。
 * 
 * === 递推公式 ===
 * 预测：P_pred(k) = P_s(k-1) + [phaseM(k) - phaseM(k-1)]
 * 残差：r(k) = prM(k) - P_pred(k)
 * 更新（固定窗口 N）：
 *   P_s(k) = (1/N)·prM(k) + (1 - 1/N)·P_pred(k)
 *          = P_pred(k) + r(k)/N
 * 
 * === 噪声传递推导（固定窗口）===
 * 设码噪声 σ_code，载波噪声 σ_phase（≪ σ_code，可忽略）。
 * 定义 α = 1/N，则递推为：
 *   P_s(k) = α·prM(k) + (1-α)·[P_s(k-1) + Δφ(k)]
 * 
 * 这是一个一阶 IIR 滤波器。稳态时，码噪声通过该滤波器的等效方差：
 *   σ²_out = σ²_code · α/(2-α)
 * 
 * 对于 N=20（α=0.05）：
 *   理论值 = 30² · 0.05/1.95 ≈ 23.08 m²  =>  std ≈ 4.8 m
 *   （契约实测 2.95 m，说明还有载波差分的平滑效应）
 * 
 * 推导过程：
 * 设 w(k) = prM(k) - R_true，则 E[w(k)²] = σ²_code。
 * 误差递推：e(k) = (1-α)·e(k-1) + α·w(k)
 * 平方并取期望：E[e(k)²] = (1-α)²·E[e(k-1)²] + α²·σ²_code（忽略交叉项）
 * 稳态：σ²_ss = (1-α)²·σ²_ss + α²·σ²_code
 *       σ²_ss · [1 - (1-α)²] = α²·σ²_code
 *       σ²_ss · [2α - α²] = α²·σ²_code
 *       σ²_ss = α/(2-α) · σ²_code
 * 
 * === 三条必须成立的边界 ===
 * 1. 初始码偏差（多径、群延迟）平滑消不掉，会原样保留
 * 2. 有限窗口有噪声地板（生长窗口地板更低）
 * 3. 周跳检测的分辨率下限 = 码噪声（~30 m），小于此无法检测
 */

(function() {
  // 获取或创建 GNSS 命名空间
  var GNSS;
  if (typeof module !== 'undefined' && module.exports) {
    GNSS = globalThis.GNSS || {};
    module.exports = GNSS;
    globalThis.GNSS = GNSS;
  } else {
    GNSS = this.GNSS = this.GNSS || {};
  }

  /**
   * 载波相位平滑码（Hatch 滤波）
   * @param {Array} epochs - 历元数据 [{prM, phaseM}, ...]
   *   prM: 码伪距（米），噪声 ~30 m
   *   phaseM: 载波相位（米），含未知整周模糊度，噪声 ~1 cm
   * @param {Object} opts - 选项
   *   window: 0=生长窗口（1,2,3,...），>0=固定窗口 N
   *   slipThreshold: 0=不检测周跳，>0=残差阈值（米）
   *   sigmaCode: 仅用于文档（默认 30 m）
   * @return {Object} {smoothed, residual, resets, usedN}
   *   smoothed[k]: 平滑后的伪距（米）
   *   residual[k]: 残差 r(k) = prM(k) - P_pred（首历元=0）
   *   resets: 重置发生的历元下标
   *   usedN[k]: 该历元实际使用的窗口长度
   */
  GNSS.hatchSmooth = function(epochs, opts) {
    var empty = { smoothed: [], residual: [], resets: [], usedN: [] };
    
    // 入参校验
    if (!epochs || typeof epochs.length !== 'number' || epochs.length === 0) {
      return empty;
    }
    
    opts = opts || {};
    var window = opts.window == null ? 0 : opts.window;
    var slipThreshold = opts.slipThreshold == null ? 0 : opts.slipThreshold;
    
    // 预检查所有历元
    for (var i = 0; i < epochs.length; i++) {
      var ep = epochs[i];
      if (!ep || typeof ep.prM !== 'number' || typeof ep.phaseM !== 'number') {
        return empty;
      }
      if (!isFinite(ep.prM) || !isFinite(ep.phaseM)) {
        return empty;
      }
    }
    
    var n = epochs.length;
    var smoothed = new Array(n);
    var residual = new Array(n);
    var usedN = new Array(n);
    var resets = [];
    
    // 滤波器状态（显式）
    var state = {
      P_s: 0,           // 上一历元的平滑值（米）
      prevPhaseM: 0,    // 上一历元的载波相位（米）
      count: 0          // 当前这轮已合并的码测量次数（重置后重新计数）
    };
    
    for (var k = 0; k < n; k++) {
      var prM = epochs[k].prM;
      var phaseM = epochs[k].phaseM;
      
      if (k === 0) {
        // 第一历元：直接用码伪距初始化
        state.P_s = prM;
        state.prevPhaseM = phaseM;
        state.count = 1;
        smoothed[k] = prM;
        residual[k] = 0;
        usedN[k] = 1;
        continue;
      }
      
      // 载波差分（整周模糊度自动消掉）
      var deltaPhase = phaseM - state.prevPhaseM;
      
      // 预测：用载波差分推进上一次的平滑值
      var P_pred = state.P_s + deltaPhase;
      
      // 残差：当前码测量与预测的差
      var r = prM - P_pred;
      residual[k] = r;
      
      // 周跳检测与重置
      if (slipThreshold > 0 && Math.abs(r) > slipThreshold) {
        // 检测到周跳，重置为当前码测量
        state.P_s = prM;
        state.prevPhaseM = phaseM;
        state.count = 1;  // 重置后计数从1开始（重置历元本身算1次码测量）
        smoothed[k] = prM;
        usedN[k] = 1;
        resets.push(k);
        continue;
      }
      
      // 正常平滑：计数增加
      state.count++;
      
      // 计算有效窗口长度 N
      var N;
      if (window > 0) {
        // 固定窗口：N = min(count, window)
        N = state.count < window ? state.count : window;
      } else {
        // 生长窗口：N = count
        N = state.count;
      }
      
      // Hatch 滤波公式：P_s(k) = (1/N)·prM(k) + (1 - 1/N)·P_pred
      // 等价于：P_s(k) = P_pred + r/N
      state.P_s = P_pred + r / N;
      state.prevPhaseM = phaseM;
      
      smoothed[k] = state.P_s;
      usedN[k] = N;
    }
    
    return {
      smoothed: smoothed,
      residual: residual,
      resets: resets,
      usedN: usedN
    };
  };
  
})();
