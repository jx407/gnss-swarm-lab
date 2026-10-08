'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/tests/test-uwls.js';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 60));
  s = s.split(find).join(rep);
}
/* 口径统一：蒙特卡洛存的是三维误差，预测也必须算三维（含 U 分量） */
sub(`  const re=rowv(E), rn=rowv(N);
  return Math.sqrt((re[0]*E[0]+re[1]*E[1]+re[2]*E[2]) + (rn[0]*N[0]+rn[1]*N[1]+rn[2]*N[2]));`,
`  const U=[Math.cos(la)*Math.cos(lo), Math.cos(la)*Math.sin(lo), Math.sin(la)];
  const ru=rowv(U);
  /* 与蒙特卡洛同口径：三维（含高程分量）。早期版本只算了水平，导致预测比实测小 1.70 倍。 */
  return Math.sqrt((re[0]*E[0]+re[1]*E[1]+re[2]*E[2]) + (rn[0]*N[0]+rn[1]*N[1]+rn[2]*N[2]) + (ru[0]*U[0]+ru[1]*U[1]+ru[2]*U[2]));`);
sub("H.check('等权：三明治协方差预测的水平 RMS 与实测同量级（0.7–1.4×）'", "H.check('等权：三明治协方差预测的三维 RMS 与实测同量级（0.7–1.4×）'");
sub("H.check('加权：协方差预测的水平 RMS 与实测同量级（0.7–1.4×）'", "H.check('加权：协方差预测的三维 RMS 与实测同量级（0.7–1.4×）'");
fs.writeFileSync(p, s);
console.log('metric aligned to 3D');
