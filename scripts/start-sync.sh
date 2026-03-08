#!/bin/bash
echo "Starting automatic Git backup..."
bash "$(dirname "$0")/git-auto-sync.sh"
