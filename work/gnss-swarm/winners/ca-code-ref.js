/* C/A 码参考实现（Codex 手写，用作基准与兜底）
 * 约定：index 0 = 第 1 个 chip；state[j] 为第 j 级寄存器（j = 0..9 对应第 1..10 级）。
 * 每个 chip 先输出 stage10(G1) 与 G2 抽头异或值，再整体右移（新 stage1 = 反馈）。
 * 该约定下 PRN1 前 10 chip = 1100100000，与 IS-GPS-200 一致（已实测核对）。 */
(function () {
  'use strict';
  var GNSS = globalThis.GNSS = globalThis.GNSS || {};
  var N = 1023;
  var TAPS = [
    [2, 6], [3, 7], [4, 8], [5, 9], [1, 9], [2, 10], [1, 8], [2, 9], [3, 10], [2, 3],
    [3, 4], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [1, 4], [2, 5], [3, 6], [4, 7],
    [5, 8], [6, 9], [1, 3], [4, 6], [5, 7], [6, 8], [7, 9], [8, 10], [1, 6], [2, 7],
    [3, 8], [4, 9]
  ];
  function build(prn) {
    var t = TAPS[prn - 1];
    var g1 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    var g2 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    var chips = new Uint8Array(N);
    var code = new Int8Array(N);
    for (var i = 0; i < N; i++) {
      var bit = g1[9] ^ (g2[t[0] - 1] ^ g2[t[1] - 1]);
      chips[i] = bit;
      code[i] = bit ? -1 : 1;
      var fb1 = g1[2] ^ g1[9];
      var fb2 = g2[1] ^ g2[2] ^ g2[5] ^ g2[7] ^ g2[8] ^ g2[9];
      for (var k = 9; k > 0; k--) { g1[k] = g1[k - 1]; g2[k] = g2[k - 1]; }
      g1[0] = fb1; g2[0] = fb2;
    }
    return { chips: chips, code: code };
  }
  var cache = {};
  function valid(prn) { return typeof prn === 'number' && prn === Math.floor(prn) && prn >= 1 && prn <= 32; }
  function pair(prn) { if (!valid(prn)) return null; if (!cache[prn]) cache[prn] = build(prn); return cache[prn]; }
  GNSS.CA_LEN = N;
  GNSS.caChips = function (prn) { var p = pair(prn); return p ? p.chips.slice() : null; };
  GNSS.caCode = function (prn) { var p = pair(prn); return p ? p.code.slice() : null; };
})();
