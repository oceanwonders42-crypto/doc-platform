#!/usr/bin/env node
/**
 * Job queue worker: polls Job table, claims atomically, runs handlers (document.reprocess,
 * timeline.rebuild, records_request.send, demand_package.generate, export.packet, etc.).
 * Run: pnpm job:runner
 */
import "dotenv/config";
import "../src/workers/jobQueueWorker";
