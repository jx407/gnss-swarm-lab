'use strict';
/* probe-hostfallback: does GLAPP.core.theme() fall back to distinct colors when the host provides NO CSS vars? */
const { createRequire } = require('node:module');
const req = createRequire('C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/');
const { chromium } = req('playwright');
const fs = require('fs');
const FRAG = 'C:/Users/31040/.codex/visualizations/2026/10/05/01a10c98-950b-7151-a024-b4d3630dcd87/gnss-swarm-lab.html';
const OUT = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/qa/tmp-nohost.html';
(async () => {
  const frag = fs.readFileSync(FRAG, 'utf8');
  fs.writeFileSync(OUT, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + frag + '</body></html>');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 980, height: 900 } });
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  await p.goto('file:///' + OUT, { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(2500);
  const th = await p.evaluate(() => GLAPP.core.theme());
  const uniq = Array.from(new Set([th.s1, th.s2, th.s3, th.s4]));
  console.log('theme(no host vars) = ' + JSON.stringify(th));
  console.log('distinct series colors = ' + uniq.length + ' -> ' + uniq.join(' | '));
  console.log('black series count = ' + [th.s1, th.s2, th.s3, th.s4].filter(c => c === 'rgb(0, 0, 0)').length);
  console.log('consoleIssues=' + logs.length + (logs.length ? ' :: ' + logs.join(' | ') : ''));
  await b.close();
  fs.unlinkSync(OUT);
})();
