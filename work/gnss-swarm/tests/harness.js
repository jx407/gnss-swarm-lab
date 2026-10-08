'use strict';
const path = require('path');
let pass = 0, fail = 0; const failures = [];
function load(...files) {
  for (const f of files) require(path.resolve(f));
  return globalThis.GNSS;
}
function section(name) { console.log('\n== ' + name + ' =='); }
function check(name, cond, info) {
  if (cond) { pass++; console.log('  PASS  ' + name + (info ? '   [' + info + ']' : '')); }
  else { fail++; failures.push(name + (info ? '   [' + info + ']' : '')); console.log('  FAIL  ' + name + (info ? '   [' + info + ']' : '')); }
}
function approx(name, actual, expected, tol, unit) {
  const d = Math.abs(actual - expected);
  check(name, Number.isFinite(actual) && d <= tol, 'got ' + fmt(actual) + ' expect ' + fmt(expected) + ' ±' + tol + (unit ? ' ' + unit : ''));
}
function inRange(name, v, lo, hi) { check(name, Number.isFinite(v) && v >= lo && v <= hi, 'got ' + fmt(v) + ' in [' + lo + ',' + hi + ']'); }
function fmt(v) {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return v.toExponential(3);
  return v.toFixed(Math.max(0, 5 - Math.floor(Math.log10(a + 1e-12))) ).replace(/\.?0+$/, '');
}
function summary() {
  console.log('\n---- ' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ' ----');
  console.log('passed=' + pass + ' failed=' + fail);
  if (fail) { console.log('failed checks:'); failures.forEach(f => console.log('  - ' + f)); }
  console.log('RESULT pass=' + pass + ' fail=' + fail);
  process.exit(fail === 0 ? 0 : 1);
}
/* 环形相关（测试专用，直接实现，独立于被测代码） */
function xcorr(a, b, lag) {
  const n = a.length; let s = 0; let j = ((lag % n) + n) % n;
  for (let i = 0; i < n; i++) { s += a[i] * b[j]; if (++j === n) j = 0; }
  return s;
}
module.exports = { load, check, approx, inRange, section, summary, xcorr, fmt,
  get pass() { return pass; }, get fail() { return fail; } };
