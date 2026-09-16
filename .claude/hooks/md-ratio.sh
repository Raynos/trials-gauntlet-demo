#!/usr/bin/env bash
# md-ratio.sh — the markdown budget (AGENTS.md: 80 % code / 20 % markdown), two modes.
#   tree             print md % of tracked lines (docs/evidence, docs/research, project/archive, reference, prototypes, assets, public excluded)
#   commit <msgfile> commit-msg hook: print md % of the staged change; refuse > 40 % unless the subject starts "Design:" or "Docs:"
set -uo pipefail
mode="${1:-tree}"
excl='^(docs/evidence|docs/research|project/archive|reference|prototypes|assets|public|harness/out|tmp)/'
count() { awk -v md=0 -v code=0 '{ if ($2 ~ /\.md$/) md += $1; else if ($2 ~ /\.(ts|tsx|js|mjs|mts|py|html|css|sh|glsl|json)$/) code += $1 } END { printf "%d %d\n", md, code }'; }
if [ "$mode" = "tree" ]; then
  read -r md code < <(git ls-files | grep -vE "$excl" | grep -E '\.(md|ts|tsx|js|mjs|mts|html|css|sh|glsl)$' | xargs wc -l 2>/dev/null | grep -v ' total$' | count)
  total=$((md + code)); pct=$(( total > 0 ? md * 100 / total : 0 ))
  echo "tree: md ${md} / code ${code} lines → ${pct} % markdown (budget 20 %)"
  exit 0
fi
msgfile="${2:-}"; subject="$(head -1 "$msgfile" 2>/dev/null || true)"
read -r md code < <(git diff --cached --numstat | grep -vE "	$excl" | awk '{print $1 + $2, $3}' | count)
total=$((md + code)); [ "$total" -gt 0 ] || exit 0
pct=$(( md * 100 / total ))
echo "commit: md ${md} / code ${code} changed lines → ${pct} % markdown"
if [ "$pct" -gt 40 ] && ! printf '%s' "$subject" | grep -qE '^(Design|Docs):'; then
  echo "REFUSED: > 40 % markdown. Start the subject with 'Design:' or 'Docs:' if this is a documentation commit, or split the prose out." >&2
  exit 1
fi
exit 0
