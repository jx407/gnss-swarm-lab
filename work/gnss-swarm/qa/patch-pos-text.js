'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 70));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* 详情行去掉冗长的 PDOP 注解（卡片与读法里已有），保持可读 */
sub('app/40-pos.js',
  "      '；注意 PDOP 反而从 ' + C.fmt(st.pdop, 2) + ' 升到 ' + C.fmt(st.pdopW, 2) +\n      '——DOP 只描述几何，把低仰角观测降权等于让有效几何变差；加权真正的作用是让噪声大的观测少说话，所以实际误差仍然更小。原点为真实位置：空心 = 等权解，实心 = 加权解。');",
  "      '。空心 = 等权解，实心 = 加权解（原点为真实位置）。');");
sub('shell.html', '读法：原点是真实位置。切到多系统后请注意：',
  '读法：原点是真实位置。多系统时把「参与解算卫星」拉到 20 以上再比较（3 个系统要多吃 2 个 ISB 未知量，只取 8 颗会让 PDOP 明显变差）。切到多系统后请注意：');
