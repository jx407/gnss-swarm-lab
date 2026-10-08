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
/* (a) 扫描同时记录最差历元（独立复核指出：只报中位/95 分会把里约 PDOP=300 的退化历元藏起来） */
sub('app/14-geo-scan.js',
  "      var pd = [], hd = [], vd = [], vs = [], maxRel = 0;",
  "      var pd = [], hd = [], vd = [], vs = [], maxRel = 0, maxP = 0, maxH = 0;");
sub('app/14-geo-scan.js',
  "          pd.push(d.pdop); hd.push(d.hdop); vd.push(d.vdop);",
  "          pd.push(d.pdop); hd.push(d.hdop); vd.push(d.vdop);\n          if (d.pdop > maxP) { maxP = d.pdop; maxH = h; }");
sub('app/14-geo-scan.js',
  "        identityMaxRel: maxRel",
  "        pdopMax: maxP, pdopMaxHour: maxH, identityMaxRel: maxRel");
/* (b) 面板改用 15 min 步长，并把最差历元显示出来 */
sub('app/14-geo-scan.js', "    var rows = APP.geoScan(cities, S.mask, 0.5);", "    var rows = APP.geoScan(cities, S.mask, 0.25);");
sub('app/14-geo-scan.js',
  "setText('gl-geo-here-ctx', C.fmt(S.lat, 1) + '° / ' + C.fmt(S.lon, 1) + '° · 95 分位 ' + C.fmt(st.here.pdopP95, 2) + ' · 可见星中位 ' + C.fmt(st.here.visMedian, 0));",
  "setText('gl-geo-here-ctx', C.fmt(S.lat, 1) + '° / ' + C.fmt(S.lon, 1) + '° · 95 分位 ' + C.fmt(st.here.pdopP95, 2) + ' · 最差历元 ' + C.fmt(st.here.pdopMax, 1) + '（t+' + C.fmt(st.here.pdopMaxHour, 2) + ' h）· 可见星中位 ' + C.fmt(st.here.visMedian, 0));");
sub('app/14-geo-scan.js',
  "'16 个站点 × 49 个历元（每 30 min）扫描 ' + st.ms + ' ms：几何最好 '",
  "'16 个站点 × 97 个历元（每 15 min）扫描 ' + st.ms + ' ms：几何最好 '");
sub('app/14-geo-scan.js',
  "'、最差 ' + worst.name + ' ' + C.fmt(worst.pdopMedian, 2) + '；所有站点逐历元满足 HDOP²+VDOP²=PDOP²（最大相对误差 ' +",
  "'、最差 ' + worst.name + ' ' + C.fmt(worst.pdopMedian, 2) + '（中位数：DOP 序列是双峰的，中位数对采样格点敏感，故用 15 min 步长并同时给出 95 分位与最差历元）；所有站点逐历元满足 HDOP²+VDOP²=PDOP²（最大相对误差 ' +");
/* (c) 网页说明同步：读法里写清中位数脆弱性 */
sub('shell.html',
  '读法：条形＝24 小时内 PDOP 的中位数，细须＝95 分位（几何最差的那几个历元），右端数字＝中位可见星数。几何主要由纬度与 6 个轨道面的相对相位决定，所以同纬度的城市几乎一样好；把上面星座面板的纬度拖到另一个半球，虚线会跟着动。',
  '读法：条形＝24 小时内 PDOP 的中位数（15 min 一个采样，共 97 个历元），细须＝95 分位，右端数字＝中位可见星数；当前站点的卡片里还给出「最差历元」——24 颗卫星的构型在某些时刻会留出天空缺口，那个数字能到十几甚至几十。注意：DOP 序列是双峰的，中位数对采样格点较敏感（独立复核实测：把步长从 1 h 加密到 15 min，个别站点中位数会移动 0.1–0.8），所以这里同时给出中位、95 分位与最差历元三个口径；把上面星座面板的纬度拖到另一个半球，虚线会跟着动。');
