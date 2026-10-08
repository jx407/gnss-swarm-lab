'use strict';
const fs = require('fs');
const path = require('path');
const root = __dirname;
const frag = process.argv[2];
const out = process.argv[3];
const title = process.argv[4] || 'GNSS 蜂群工作台';
const css = fs.readFileSync(path.join(root, 'app', '99-standalone.css'), 'utf8');
const bodyRaw = fs.readFileSync(frag, 'utf8');
/* 独立版包进 <main>（真正的 landmark）；宿主片段不加，避免与宿主自己的 main 重复 */
const body = '<main>\n' + bodyRaw + '\n</main>';
const html = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + title + '</title>\n<style>\n' + css + '</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('standalone ' + out + ' (' + Buffer.byteLength(html) + ' bytes)');
