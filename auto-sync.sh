#!/usr/bin/env bash
# Auto-sync: periodically commit and push local changes to origin/main.
# Run from project root. Use Ctrl+C to stop.

set -e
cd "$(dirname "$0")"

echo "Auto-sync started (every 300s). Press Ctrl+C to stop."
while true; do
  if [ -n "$(git status --porcelain)" ]; then
    git add .
    if ! git diff --cached --quiet; then
      ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      git commit -m "auto sync $ts"
      git push origin main
      echo "[$(date +%H:%M:%S)] Synced and pushed."
    else
      echo "[$(date +%H:%M:%S)] No staged changes (all changes may be ignored)."
    fi
  else
    echo "[$(date +%H:%M:%S)] No changes to sync"
  fi
  sleep 300
done
