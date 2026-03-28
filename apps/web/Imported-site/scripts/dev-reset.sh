#!/usr/bin/env sh
# Reset dev environment and start Next.js dev server.
# Use when: port 3000/3004 is stuck or .next/dev/lock causes conflicts.

set -e
cd "$(dirname "$0")/.."

echo "Checking for processes on ports 3000 and 3004..."
for port in 3000 3004; do
  pid=$(lsof -ti :$port 2>/dev/null) || true
  if [ -n "$pid" ]; then
    echo "Killing process $pid on port $port"
    kill -9 $pid 2>/dev/null || true
  fi
done

echo "Removing .next/dev/lock if present..."
rm -f .next/dev/lock

echo "Starting dev server..."
exec npm run dev
