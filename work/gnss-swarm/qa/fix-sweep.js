'use strict';
const fs = require('fs');
const S = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa/probe-sweep.js';
let s = fs.readFileSync(S, 'utf8');
let bad = 0;
function rep(from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { console.error('MISMATCH ' + n + ' :: ' + from.slice(0, 44)); bad++; return; }
  s = s.replace(from, to);
}
/* ① 尺寸取布局盒（隐藏面板 = 0），不再用 getComputedStyle 的 "100%" */
rep("        const cs = getComputedStyle(cv);\n        const w = parseFloat(cs.width), h = parseFloat(cs.height);",
    "        const rect = cv.getBoundingClientRect();\n        const w = rect.width, h = rect.height;   /* 隐藏面板为 0：分析时跳过，避免 getComputedStyle 的 \"100%\" 被当成 100px */");
/* ② 分析时跳过不可见 canvas */
rep("      const t = all[id];\n      if (!t || !t.length) return;\n      const w = t[0].w, h = t[0].h;",
    "      const t = all[id];\n      if (!t || !t.length) return;\n      const w = t[0].w, h = t[0].h;\n      if (!(w >= 5) || !(h >= 5)) return;   /* 隐藏面板：跳过 */");
/* ③ 只绘制当前场景的面板（不要再画全部面板：隐藏状态下画出来的帧没有意义） */
rep("        for (const n of PANELS) {\n          await p.evaluate((nn) => { const q = GLAPP.panels[nn]; if (q && q.draw) q.draw(); if (nn === 'cold' && GLAPP.panels.dll && GLAPP.panels.dll.draw) GLAPP.panels.dll.draw(); if (nn === 'pll' && GLAPP.panels.hatch && GLAPP.panels.hatch.draw) GLAPP.panels.hatch.draw(); }, n);\n        }",
    "        await p.click('#gl-tab-' + panel);\n        await p.waitForTimeout(250);\n        await p.evaluate((nn) => {\n          const q = GLAPP.panels[nn]; if (q && q.draw) q.draw();\n          if (nn === 'cold' && GLAPP.panels.dll && GLAPP.panels.dll.draw) GLAPP.panels.dll.draw();\n          if (nn === 'pll' && GLAPP.panels.hatch && GLAPP.panels.hatch.draw) GLAPP.panels.hatch.draw();\n        }, panel);");
if (bad) process.exit(1);
fs.writeFileSync(S, s);
console.log('OK：扫描器已修（布局盒尺寸 + 跳过隐藏 canvas + 只画当前页）');
