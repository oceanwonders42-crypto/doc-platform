#!/bin/bash

echo "Starting dev server..."
while true; do
  pnpm dev
  exit_code=$?
  echo "Server crashed (exit code: $exit_code)"
  echo "Restarting in 2 seconds..."
  sleep 2
  echo "Restarting..."
done
