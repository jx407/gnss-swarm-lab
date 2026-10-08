'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 50));
  s = s.split(find).join(rep);
}
sub('<li><strong>星座几何</strong>：24 颗解析圆轨道（Walker 24/6/2，a = 26561.75 km，i = 55°），轨道面升交点随地球自转以 −Ωe·t 西漂；接收机位置用 WGS-84。',
  '<li><strong>星座几何</strong>：可切「仅 GPS（24 颗）」/「+Galileo（48）」/「+BeiDou（72）」三档——三套系统都是解析圆轨道（GPS a = 26561.75 km、i = 55°，Galileo a = 29599.8 km、i = 56°，BeiDou-3 MEO a = 27906.1 km、i = 55°），轨道面升交点随地球自转以 −Ωe·t 西漂；GPS 单系统的位置与早期版本逐位一致。实测同一时刻可见星 7 → 21 颗、PDOP 2.81 → 1.06。接收机位置用 WGS-84。');
fs.writeFileSync(p, s);
console.log('about updated with multi-system, bytes=' + Buffer.byteLength(s));
