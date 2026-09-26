#!/usr/bin/env bash
# Usage: npm run issues -- owner/repo   →  writes docs/TEST-ISSUES.md
# Lists every open issue of a repository so the team can pick evaluation targets.
set -euo pipefail
REPO="${1:?usage: list-issues.sh owner/repo}"
OUT="docs/TEST-ISSUES.md"
mkdir -p docs
{
  echo "# Open issues — $REPO"
  echo
  echo "_Generated $(date -u +%Y-%m-%d) with \`gh issue list\`._"
  echo
  echo "| # | Title | Labels | Link |"
  echo "|---|-------|--------|------|"
  gh issue list -R "$REPO" --state open --limit 200 --json number,title,labels,url \
    --jq '.[] | "| \(.number) | \(.title | gsub("\\|";"/")) | \([.labels[].name] | join(", ")) | \(.url) |"'
} > "$OUT"
echo "Wrote $OUT ($(($(wc -l < "$OUT") - 6)) issues)"
