#!/usr/bin/env bash
# 一键重建交付物 → 项目根 outputs/（并刷新 GitHub Pages 入口 docs/index.html）
# 不依赖项目外任何路径；需要 node（脚本里给了本机运行时的绝对路径，换机器请改成自己的 node）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/outputs"
NODE="${NODE:-C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe}"
cd "$HERE"
"$NODE" build.js "$OUT/gnss-swarm-lab.inline.html"
"$NODE" build-standalone.js "$OUT/gnss-swarm-lab.inline.html" "$OUT/gnss-swarm-lab.html" "GNSS 蜂群工作台"
cp -f "$OUT/gnss-swarm-lab.html" "$ROOT/docs/index.html"          # GitHub Pages 入口
sha256sum "$OUT/gnss-swarm-lab.inline.html" "$OUT/gnss-swarm-lab.html"
