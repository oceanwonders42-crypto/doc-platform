/**
 * PM2 ecosystem config for doc-platform (API, worker, web).
 * Run from repo root: pm2 start ecosystem.config.cjs
 */
const path = require("path");

module.exports = {
  apps: [
    {
      name: "doc-platform-api",
      cwd: path.join(__dirname, "apps", "api"),
      script: "dist/http/server.js",
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "2s",
      env: { NODE_ENV: "production" },
    },
    {
      name: "doc-platform-worker",
      cwd: path.join(__dirname, "apps", "api"),
      script: "dist/workers/worker.js",
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "2s",
      env: { NODE_ENV: "production" },
    },
    {
      name: "doc-platform-web",
      cwd: path.join(__dirname, "apps", "web"),
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "2s",
      env: { NODE_ENV: "production", PORT: "3000" },
    },
  ],
};
