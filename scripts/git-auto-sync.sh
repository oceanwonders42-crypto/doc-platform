#!/bin/bash
# Automatic Git backup: stage, commit (only if changes), push. Runs every 15 minutes.
# Safety: runs from repo root, commits only when there are staged changes, logs push errors.

set -e
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Not a git repo."; exit 1; }
cd "$ROOT" || exit 1

LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/git-sync.log"
mkdir -p "$LOG_DIR"

log() {
  echo "[$(date +"%Y-%m-%d %H:%M:%S")] $*" | tee -a "$LOG_FILE"
}

while true; do
  git add .

  git diff --cached --quiet
  if [ $? -ne 0 ]; then
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
    git commit -m "auto-backup $TIMESTAMP" || { log "commit failed"; sleep 900; continue; }
    if ! git push origin main 2>>"$LOG_FILE"; then
      log "push failed (see above). Will retry next cycle."
    fi
  fi

  sleep 900
done
