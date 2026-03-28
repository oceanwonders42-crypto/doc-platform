#!/bin/sh
set -eu

mkdir -p /app/node_modules
cp -R /opt/node_modules/. /app/node_modules

cd /app
pnpm db:setup
exec pnpm dev --hostname 0.0.0.0
