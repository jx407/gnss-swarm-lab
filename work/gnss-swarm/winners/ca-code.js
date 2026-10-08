/* GNSS C/A 码发生器 —— 变体 B：10 bit 整数状态机 + 位平面查表
 *
 * 实现思路（刻意避开教科书里「两个 10 元数组逐级搬移 + 逐位异或」的写法）：
 *
 * 1) 整体整数移位代替逐级搬家。
 *    把 G1/G2 的 10 级寄存器压缩进一个 10 bit 无符号整数，约定
 *    R(k)（第 k 级）占据 bit(k-1)，即 bit9 = R10（末级）。那么经典的
 *    「每级寄存器往后搬一级 R(k)->R(k+1)、反馈位补进 R1」就退化成一条
 *    整型语句（此处的「移位」是整数左移，方向 = 级号增大）：
 *        next = ((state << 1) | fb) & 0x3FF
 *    R10 的旧值（输出位）就是 (state >>> 9) & 1。
 *    等价性证明：整数左移把 R(k) 恰好搬到 R(k+1)，低位补 fb 恰好等于「新 R1 = fb」，
 *    mask 0x3FF 丢弃溢出比特；逐步展开与教科书写法的每一步状态完全相同。
 *
 * 2) 反馈位用「多项式抽头掩码 + 4 bit 奇偶查表」求，不做逐位循环。
 *    G1（1+x^3+x^10）          反馈抽头 = {R3, R10}          -> mask 0x204
 *    G2（1+x^2+x^3+x^6+x^8+x^9+x^10） = {R2,R3,R6,R8,R9,R10} -> mask 0x3A6
 *    fb = parity10(state & mask)，用 16 项半字节奇偶表 PAR4 三次查表代替 10 次异或。
 *
 * 3) 预计算状态机 + 抽头查表（本变体的核心）。
 *    两个 LFSR 的初态都是 10 个 1（IS-GPS-200 规定），且只跑 1023 步一个周期，
 *    因此在首次调用时就把 0..1022 步的 10 bit 状态各跑一遍（只做一次，惰性，
 *    让模块加载本身不花时间）；再把 G2 的状态序列
 *    按位拆成 10 张 Uint8Array(1023) 位平面 PLANES[k][i] = R(k+1) 在第 i 步的值。
 *    于是任意 PRN 只需
 *        chip_i = g1Bits[i] ^ PLANES[a-1][i] ^ PLANES[b-1][i]
 *    （{a,b} 为 Table 3-Ia 的两级抽头，G2_out = R(a) XOR R(b)，chip = G1_out XOR G2_out）
 *    生成循环里没有移位、没有分支、没有逐级数组拷贝。
 *
 * 4) 输出约定与缓存：chip 0 -> +1，chip 1 -> -1；每个 PRN 的码只算一次并缓存，
 *    返回给调用方的是副本，避免调用方写坏缓存影响后续调用的可复现性。
 *    非法 prn（非整数 / 越界）一律返回 null，不抛异常。
 */
(function () {
  'use strict';
  var GNSS = globalThis.GNSS = globalThis.GNSS || {};

  var CA_LEN = 1023;
  var STATE_MASK = 0x3FF;   /* 10 bit 寄存器组 */

  /* ---------- 半字节奇偶表：PAR4[x] = x 的二进制奇偶（0 或 1） ---------- */
  var PAR4 = new Uint8Array(16);
  for (var i = 0; i < 16; i++) PAR4[i] = (i & 1) ^ ((i >> 1) & 1) ^ ((i >> 2) & 1) ^ ((i >> 3) & 1);

  /* 3 次查表得到 10 bit 值的奇偶（高 2 位单独处理，不需要第 4 张表项） */
  function parity10(v) { return PAR4[v & 15] ^ PAR4[(v >> 4) & 15] ^ PAR4[(v >> 8) & 3]; }

  /* ---------- 两个 LFSR 的反馈抽头掩码（bit 位置 = 级号 - 1） ---------- */
  var G1_FB_MASK = (1 << 2) | (1 << 9);                                   /* R3, R10 */
  var G2_FB_MASK = (1 << 1) | (1 << 2) | (1 << 5) | (1 << 7) | (1 << 8) | (1 << 9);

  /* ---------- Table 3-Ia：G2 抽头对（1 基级号，G2_out = R(a) XOR R(b)） ---------- */
  var TAPS = [
    [2, 6], [3, 7], [4, 8], [5, 9], [1, 9], [2, 10], [1, 8], [2, 9],
    [3, 10], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10],
    [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [1, 3], [4, 6],
    [5, 7], [6, 8], [7, 9], [8, 10], [1, 6], [2, 7], [3, 8], [4, 9]
  ];

  /* ---------- 预计算：两个 LFSR 一个周期的状态序列 ---------- */
  function runStates(fbMask) {
    var states = new Uint16Array(CA_LEN);
    var state = STATE_MASK;                    /* 初态 1111111111 */
    for (var i = 0; i < CA_LEN; i++) {
      states[i] = state;                       /* 记录第 i 步（移位前）的状态 */
      state = ((state << 1) | parity10(state & fbMask)) & STATE_MASK;
    }
    return states;
  }

  var G1_BITS = null;   /* G1 输出位平面（R10 = bit9）；首次使用时才填 */
  var PLANES = null;    /* G2 的 10 张位平面：PLANES[k][i] = R(k+1) 在第 i 步的值 */

  /* 惰性预计算：只做一次，且先把结果算完再发布，读到的表永远是完整的 */
  function ensureTables() {
    if (PLANES !== null) return;
    var g1States = runStates(G1_FB_MASK);
    var g1Bits = new Uint8Array(CA_LEN);
    for (var i = 0; i < CA_LEN; i++) g1Bits[i] = (g1States[i] >>> 9) & 1;
    var g2States = runStates(G2_FB_MASK);
    var planes = new Array(10);
    for (var k = 0; k < 10; k++) {
      var plane = new Uint8Array(CA_LEN);
      for (i = 0; i < CA_LEN; i++) plane[i] = (g2States[i] >>> k) & 1;
      planes[k] = plane;
    }
    G1_BITS = g1Bits;
    PLANES = planes;
  }

  /* ---------- PRN 校验与缓存 ---------- */
  function isPrn(v) {
    return typeof v === 'number' && v === (v | 0) && v >= 1 && v <= 32;
  }

  var chipCache = new Array(33);   /* Uint8Array 0/1 母本 */
  var codeCache = new Array(33);   /* Int8Array +1/-1 母本 */

  function buildChips(prn) {
    ensureTables();
    var tap = TAPS[prn - 1];
    var planeA = PLANES[tap[0] - 1];
    var planeB = PLANES[tap[1] - 1];
    var out = new Uint8Array(CA_LEN);
    for (var i2 = 0; i2 < CA_LEN; i2++) out[i2] = G1_BITS[i2] ^ planeA[i2] ^ planeB[i2];
    return out;
  }

  function buildCode(prn) {
    var chips = buildChips(prn);
    var out = new Int8Array(CA_LEN);
    for (var i3 = 0; i3 < CA_LEN; i3++) out[i3] = chips[i3] ? -1 : 1;   /* chip 0 -> +1, chip 1 -> -1 */
    return out;
  }

  /* 契约 §1：caCode(prn) -> Int8Array(1023)，取值 +1/-1，index 0 = 第 1 个 chip */
  function caCode(prn) {
    if (!isPrn(prn)) return null;
    var base = codeCache[prn];
    if (!base) { base = codeCache[prn] = buildCode(prn); }
    return base.slice();                     /* 返回副本，缓存不被调用方污染 */
  }

  /* 契约 §1：caChips(prn) -> Uint8Array(1023)，0/1，与 caCode 严格对应 */
  function caChips(prn) {
    if (!isPrn(prn)) return null;
    var base = chipCache[prn];
    if (!base) { base = chipCache[prn] = buildChips(prn); }
    return base.slice();
  }

  GNSS.caCode = caCode;
  GNSS.caChips = caChips;
  GNSS.CA_LEN = CA_LEN;
})();
