/* 多系统星座的统一入口：APP.satsAt(t) 按当前选择返回卫星集合
 * 未加载多系统模块时自动退回 GPS 单系统（GNSS.allSats），保证向后兼容。 */
(function () {
  'use strict';
  var APP = globalThis.GLAPP = globalThis.GLAPP || {};
  APP.state.systems = APP.state.systems || ['G'];
  var SYS_INFO = { G: { name: 'GPS', short: 'G' }, E: { name: 'Galileo', short: 'E' }, C: { name: 'BeiDou', short: 'C' } };

  APP.state.constSource = APP.state.constSource || 'syn';
  APP.satsAt = function (tSec) {
    var G = globalThis.GNSS;
    /* 真实星座模式：CelesTrak 平均根数 + 简化开普勒传播，tSec 是相对 T0（最新历元）的秒数 */
    if (APP.state.constSource === 'real' && typeof G.realConst === 'function') return G.realConst(tSec);
    var list = APP.state.systems || ['G'];
    if (G.multiconst && !(list.length === 1 && list[0] === 'G')) return G.multiconst(tSec, list);
    if (G.multiconst) return G.multiconst(tSec, ['G']);
    return G.allSats(tSec);
  };
  /* 取卫星的 C/A 码编号：合成/多系统模式 prn 形如 'G12'，真实星座模式是数字 1..32 */
  APP.codePrnOf = function (prn) {
    var str = String(prn);
    var m = /^([A-Za-z])(\d+)$/.exec(str);
    return m ? parseInt(m[2], 10) : (parseInt(str, 10) || 1);
  };
  APP.sysOf = function (prn) {
    var s = String(prn);
    return SYS_INFO[s.charAt(0)] ? s.charAt(0) : 'G';
  };
  APP.sysName = function (code) { return SYS_INFO[code] ? SYS_INFO[code].name : code; };
  APP.sysCounts = function (list) {
    var out = { G: 0, E: 0, C: 0 };
    for (var i = 0; i < list.length; i++) out[APP.sysOf(list[i].prn)]++;
    return out;
  };
  APP.sysCountsText = function (list) {
    var c = APP.sysCounts(list), parts = [];
    if (c.G) parts.push('GPS ' + c.G);
    if (c.E) parts.push('Gal ' + c.E);
    if (c.C) parts.push('BDS ' + c.C);
    return parts.join(' + ');
  };
  APP.setSystems = function (list, label) {
    APP.state.systems = list.slice();
    APP.state.systemsLabel = label || list.join('+');
  };
})();
