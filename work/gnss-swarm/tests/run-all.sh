#!/usr/bin/env bash
# 全套权威判据：逐套运行，任一失败即非零退出
cd "$(dirname "$0")/.." || exit 2
NODE="${NODE:-C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe}"
pass=0; fail=0; failed=""
run() {  # run <test> [target]
  local out
  out="$("$NODE" "tests/$1" $2 2>&1)"; local line
  line="$(printf '%s\n' "$out" | grep -E '^RESULT ' | tail -1)"
  if [ -z "$line" ]; then echo "  ?? $1 无 RESULT 输出"; printf '%s\n' "$out" | tail -5; fail=$((fail+1)); failed="$failed $1"; return; fi
  echo "  $1 ${2:-} → $line"
  case "$line" in *"fail=0"*) pass=$((pass+1));; *) fail=$((fail+1)); failed="$failed $1";; esac
}
run test-signal-conv.js
run test-ca.js winners/ca-code.js
run test-ephemeris.js winners/ephemeris.js
run test-acquisition.js winners/acquisition.js
run test-acq-v2.js winners/acquisition-v2.js
run test-finesearch.js winners/finesearch.js
run test-bandlimit.js
run test-positioning.js winners/raim.js
run test-raim.js winners/raim.js
run test-multipath.js winners/multipath.js
run test-atmos.js winners/atmos.js
run test-uwls.js winners/uwls.js
run test-multiconst.js winners/multiconst.js
run test-isb.js winners/isb.js
run test-hpl.js winners/pl.js
run test-realconst.js winners/realconst.js
run test-dll.js winners/dll.js
run test-navfilter.js winners/navfilter.js
run test-pll.js winners/pll.js
run test-hatch.js winners/hatch.js
run test-ionofree.js winners/ionofree.js
echo "---- 判据总览：$pass 套全绿，$fail 套失败$failed ----"
[ "$fail" -eq 0 ]
