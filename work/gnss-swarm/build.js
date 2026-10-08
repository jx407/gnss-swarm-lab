'use strict';
const fs = require('fs');
const path = require('path');
const root = __dirname;
const outPath = process.argv[2] || path.join(root, 'build', 'gnss-swarm-lab.html');
const files = fs.readFileSync(path.join(root, 'winners', 'manifest.txt'), 'utf8')
  .split(/\r?\n/).map(s => s.trim()).filter(s => s && s[0] !== '#');
const shell = fs.readFileSync(path.join(root, 'shell.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app', '00-style.css'), 'utf8');
const parts = files.map(f => '/* ==== ' + f + ' ==== */\n' + fs.readFileSync(path.join(root, f), 'utf8'));
const js = parts.join('\n');
if (/<\/script/i.test(js) || /<\/script/i.test(shell)) throw new Error('bundle would close the script tag early');
const html = shell + '\n<style>\n' + css + '</style>\n<script>\n' + js + '\n</script>\n';
const bytes = Buffer.byteLength(html);
if (bytes > 1000000) throw new Error('fragment exceeds 1 MB: ' + bytes);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log('wrote ' + outPath + ' (' + bytes + ' bytes, ' + files.length + ' modules)');
