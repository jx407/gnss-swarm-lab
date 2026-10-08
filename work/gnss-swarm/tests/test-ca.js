'use strict';
const H = require('./harness.js'); const fs = require('fs');
const target = process.argv[2];
if (!target) { console.error('usage: node test-ca.js <candidate.js>'); process.exit(2); }
const G = H.load(process.argv[3] || path0(), target);
function path0() { return __dirname + '/../lib/signal.js'; }
const PRNS = Array.from({ length: 32 }, (_, i) => i + 1);

H.section('接口与取值范围');
const codes = [];
let structOk = true, valOk = true, lenOk = true, balOk = true;
for (const p of PRNS) {
  const c = G.caCode(p);
  codes.push(c);
  if (!c) { structOk = false; continue; }
  if (typeof c.length !== 'number' || c.length !== 1023) lenOk = false;
  let ones = 0, minus = 0;
  for (let i = 0; i < 1023; i++) { if (c[i] === 1) ones++; else if (c[i] === -1) minus++; else valOk = false; }
  if (!((ones === 512 && minus === 511) || (ones === 511 && minus === 512))) balOk = false;
}
H.check('caCode(1..32) 均返回非空', structOk);
H.check('长度全部为 1023', lenOk);
H.check('取值只含 +1 / -1', valOk);
H.check('每个码 +1/-1 个数为 512/511', balOk);
H.check('非法 PRN 返回 null', G.caCode(0) === null && G.caCode(33) === null && G.caCode(1.5) === null && G.caCode('x') === null);

H.section('G2 抽头 / PRN1 前 10 chip');
let chips = G.caChips ? G.caChips(1) : null;
if (!chips) { chips = new Uint8Array(1023); for (let i = 0; i < 1023; i++) chips[i] = codes[0][i] === 1 ? 0 : 1; }
const s10 = Array.from(chips.slice(0, 10)).join('');
const inv10 = Array.from(chips.slice(0, 10)).map(b => (b ^ 1)).join('');
H.check('PRN1 前 10 chip = 1100100000（或整体取反）', s10 === '1100100000' || inv10 === '1100100000', 'got ' + s10);
if (G.caChips) {
  let map = true;
  for (let i = 0; i < 1023; i++) if (G.caChips(3)[i] !== (G.caCode(3)[i] === 1 ? 0 : 1)) map = false;
  H.check('caChips 与 caCode 映射一致（0 -> +1）', map);
}
let distinct = true;
for (let a = 0; a < 32; a++) for (let b = a + 1; b < 32; b++) {
  let same = true; for (let i = 0; i < 1023; i++) if (codes[a][i] !== codes[b][i]) { same = false; break; }
  if (same) distinct = false;
}
H.check('32 个码互不相同', distinct);

H.section('Gold 相关性质（自相关）');
const badVals = new Set(); let autoMax = 0, peakOk = true;
for (let p = 0; p < 32; p++) {
  const c = codes[p];
  if (H.xcorr(c, c, 0) !== 1023) peakOk = false;
  for (let lag = 1; lag < 1023; lag++) {
    const v = H.xcorr(c, c, lag);
    badVals.add(v);
    autoMax = Math.max(autoMax, Math.abs(v));
  }
}
const allowed = new Set([63, -1, -65]);
const valuesOk = Array.from(badVals).every(v => allowed.has(v));
H.check('lag=0 自相关 = 1023（全部 32 个码）', peakOk);
H.check('非峰值自相关只出现 63 / -1 / -65', valuesOk, 'observed=' + Array.from(badVals).sort((a, b) => a - b).join(','));
H.check('非峰值自相关绝对值最大值 = 65', autoMax === 65, 'max=' + autoMax);

H.section('Gold 相关性质（互相关，全部 496 对）');
let crossMax = 0, crossWorst = '', crossVals = new Set();
const quick = process.env.CA_CROSS === 'quick';
for (let a = 0; a < 32; a++) for (let b = a + 1; b < 32; b++) {
  if (quick && (a + b) % 7 !== 0) continue;
  for (let lag = 0; lag < 1023; lag++) {
    const v = H.xcorr(codes[a], codes[b], lag);
    crossVals.add(v);
    if (Math.abs(v) > crossMax) { crossMax = Math.abs(v); crossWorst = 'PRN' + (a + 1) + '/PRN' + (b + 1) + ' lag=' + lag + ' val=' + v; }
  }
}
H.check('互相关绝对值上界 ≤ 65' + (quick ? '（抽样模式）' : '（全部 496 对 × 1023 lag）'), crossMax <= 65, 'max=|' + crossMax + '| ' + crossWorst);
if (!quick) H.check('互相关取值集合 ⊆ {63,-1,-65}', Array.from(crossVals).every(v => allowed.has(v)), 'distinct=' + crossVals.size);
H.summary();
