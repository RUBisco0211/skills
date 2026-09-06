#!/usr/bin/env bash
# 将本仓库中的所有 skill 软链接到目标 skills 目录
set -euo pipefail

TARGET="${1:-$HOME/.agents/skills}"
mkdir -p "$TARGET"

for skill_dir in "$PWD"/*/; do
  name="$(basename "$skill_dir")"
  link="$TARGET/$name"
  if [ -L "$link" ]; then
    echo "link existed: $link"
  elif [ -e "$link" ]; then
    echo "skip: $link" >&2
  else
    ln -s "$skill_dir" "$link"
    echo "linked: $link -> $skill_dir"
  fi
done
