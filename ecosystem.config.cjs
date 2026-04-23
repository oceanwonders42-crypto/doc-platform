/**
 * PM2 ecosystem config for doc-platform (API, worker, web).
 * Run from repo root: pm2 start ecosystem.config.cjs
 */
const fs = require("fs");
const path = require("path");

function loadOptionalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  process.loadEnvFile(filePath);
}

const apiEnvPath = path.join(__dirname, "apps", "api", ".env");
const apiEnvLocalPath = path.join(__dirname, "apps", "api", ".env.local");
const webEnvPath = path.join(__dirname, "apps", "web", ".env.local");

loadOptionalEnvFile(apiEnvPath);
loadOptionalEnvFile(apiEnvLocalPath);
loadOptionalEnvFile(webEnvPath);

const resolvedTesseractPath =
  process.env.TESSERACT_PATH?.trim() || "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";
const resolvedPm2LogRoot =
  process.env.DOC_PROD_LOG_ROOT?.trim() || path.join(__dirname, "logs", "pm2");
const resolvedOpenAiEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
  OPENAI_PROJECT: process.env.OPENAI_PROJECT,
};

module.exports = {
  apps: [
    {
      name: "doc-platform-api",
      cwd: path.join(__dirname, "apps", "api"),
      script: path.join(__dirname, "scripts", "start-service-with-build-info.mjs"),
      args: ["api", "node", "dist/http/server.js"],
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 200,
      kill_timeout: 10000,
      listen_timeout: 10000,
      max_memory_restart: "700M",
      merge_logs: true,
      time: true,
      out_file: path.join(resolvedPm2LogRoot, "api-out.log"),
      error_file: path.join(resolvedPm2LogRoot, "api-error.log"),
      env: {
        NODE_ENV: "production",
        SESSION_SECRET: process.env.SESSION_SECRET,
        JWT_SECRET: process.env.JWT_SECRET,
        API_SECRET: process.env.API_SECRET,
        PROVIDER_SESSION_SECRET: process.env.PROVIDER_SESSION_SECRET,
        TESSERACT_PATH: resolvedTesseractPath,
        DOC_PROD_STATE_ROOT: process.env.DOC_PROD_STATE_ROOT,
        DOC_PROD_RELEASE_ROOT: process.env.DOC_PROD_RELEASE_ROOT,
        DOC_PROD_CANONICAL_SOURCE: process.env.DOC_PROD_CANONICAL_SOURCE,
        DOC_PROD_CANONICAL_REMOTE: process.env.DOC_PROD_CANONICAL_REMOTE,
        DOC_PROD_CANONICAL_BRANCH: process.env.DOC_PROD_CANONICAL_BRANCH,
        DOC_PROD_API_ENV: process.env.DOC_PROD_API_ENV,
        DOC_PROD_WEB_ENV: process.env.DOC_PROD_WEB_ENV,
        DOC_PROD_LOG_ROOT: resolvedPm2LogRoot,
        DOC_RUNTIME_RELEASE_LOCK: process.env.DOC_RUNTIME_RELEASE_LOCK ?? "true",
        ...resolvedOpenAiEnv,
      },
    },
    {
      name: "doc-platform-worker",
      cwd: path.join(__dirname, "apps", "api"),
      script: path.join(__dirname, "scripts", "start-service-with-build-info.mjs"),
      args: ["worker", "node", "dist/workers/worker.js"],
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 200,
      kill_timeout: 10000,
      listen_timeout: 10000,
      max_memory_restart: "700M",
      merge_logs: true,
      time: true,
      out_file: path.join(resolvedPm2LogRoot, "worker-out.log"),
      error_file: path.join(resolvedPm2LogRoot, "worker-error.log"),
      env: {
        NODE_ENV: "production",
        TESSERACT_PATH: resolvedTesseractPath,
        DOC_PROD_STATE_ROOT: process.env.DOC_PROD_STATE_ROOT,
        DOC_PROD_RELEASE_ROOT: process.env.DOC_PROD_RELEASE_ROOT,
        DOC_PROD_CANONICAL_SOURCE: process.env.DOC_PROD_CANONICAL_SOURCE,
        DOC_PROD_CANONICAL_REMOTE: process.env.DOC_PROD_CANONICAL_REMOTE,
        DOC_PROD_CANONICAL_BRANCH: process.env.DOC_PROD_CANONICAL_BRANCH,
        DOC_PROD_API_ENV: process.env.DOC_PROD_API_ENV,
        DOC_PROD_WEB_ENV: process.env.DOC_PROD_WEB_ENV,
        DOC_PROD_LOG_ROOT: resolvedPm2LogRoot,
        DOC_RUNTIME_RELEASE_LOCK: process.env.DOC_RUNTIME_RELEASE_LOCK ?? "true",
        ...resolvedOpenAiEnv,
      },
    },
    {
      name: "doc-platform-web",
      cwd: path.join(__dirname, "apps", "web"),
      script: path.join(__dirname, "scripts", "start-service-with-build-info.mjs"),
      args: ["web", "node", "node_modules/next/dist/bin/next", "start"],
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 200,
      kill_timeout: 10000,
      listen_timeout: 15000,
      max_memory_restart: "900M",
      merge_logs: true,
      time: true,
      out_file: path.join(resolvedPm2LogRoot, "web-out.log"),
      error_file: path.join(resolvedPm2LogRoot, "web-error.log"),
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        DOC_PROD_STATE_ROOT: process.env.DOC_PROD_STATE_ROOT,
        DOC_PROD_RELEASE_ROOT: process.env.DOC_PROD_RELEASE_ROOT,
        DOC_PROD_CANONICAL_SOURCE: process.env.DOC_PROD_CANONICAL_SOURCE,
        DOC_PROD_CANONICAL_REMOTE: process.env.DOC_PROD_CANONICAL_REMOTE,
        DOC_PROD_CANONICAL_BRANCH: process.env.DOC_PROD_CANONICAL_BRANCH,
        DOC_PROD_API_ENV: process.env.DOC_PROD_API_ENV,
        DOC_PROD_WEB_ENV: process.env.DOC_PROD_WEB_ENV,
        DOC_PROD_LOG_ROOT: resolvedPm2LogRoot,
        DOC_RUNTIME_RELEASE_LOCK: process.env.DOC_RUNTIME_RELEASE_LOCK ?? "true",
      },
    },
  ],
};
