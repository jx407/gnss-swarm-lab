'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/candidates/multipath/a.js';
let s = fs.readFileSync(p, 'utf8');
const block = `
    // 近场横向覆盖（见文件头注释；远场 ds ≫ 墙面尺寸时自动跳过）
    var wallSize = Math.max(2 * wall.halfWidthM, wall.zMaxM - wall.zMinM);
    var satAlongM = dot(sub(sat, p), u);
    if (ds <= NEAR_FIELD_K * wallSize && Math.abs(satAlongM) > wall.halfWidthM + EPS_RANGE) {
      return { ok: false, reason: '近场卫星横向偏移超出墙面 along 覆盖（|along(sat)| = ' + Math.abs(satAlongM) +
        ' > halfWidthM = ' + wall.halfWidthM + '）' };
    }
`;
if (s.indexOf(block) < 0) throw new Error('near-field block not found');
s = s.replace(block, '\n');
/* 头部注释同步：删掉那条补充判据的说明，改成"严格按契约镜像法" */
s = s.replace(/ \*   - 近场横向覆盖（演示级补充判据[\s\S]*?\n/, '');
s = s.replace(/ \*     （[^\n]*NEAR_FIELD_K[^\n]*\n/g, '');
s = s.replace(/  var NEAR_FIELD_K = 100;.*\n/, '');
if (/NEAR_FIELD/.test(s)) { console.log('WARN: 仍有 NEAR_FIELD 残留'); } else { console.log('near-field heuristic removed'); }
fs.writeFileSync(p, s);
