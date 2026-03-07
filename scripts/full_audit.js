#!/usr/bin/env node
/**
 * Full project audit — generates audit/latest_audit.json
 * Run from repo root: node scripts/full_audit.js
 */
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const AUDIT_DIR = path.join(ROOT, "audit");
const OUT_JSON = path.join(AUDIT_DIR, "latest_audit.json");

function run(cmd, opts = {}) {
  try {
    const result = spawnSync(cmd, { shell: true, cwd: opts.cwd || ROOT, encoding: "utf8", timeout: opts.timeout || 60000 });
    return { ok: result.status === 0, stdout: (result.stdout || "").trim(), stderr: (result.stderr || "").trim(), status: result.status };
  } catch (e) {
    return { ok: false, stdout: "", stderr: String(e && e.message), status: -1 };
  }
}

function safeListDir(dir, default_ = []) {
  try {
    const p = path.join(ROOT, dir);
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) return default_;
    return fs.readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, isDir: d.isDirectory() }));
  } catch {
    return default_;
  }
}

function findFiles(dir, patterns, base = "") {
  const results = [];
  const full = path.join(ROOT, base || "", dir);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) return results;
  function walk(d, prefix) {
    const entries = fs.readdirSync(path.join(full, prefix), { withFileTypes: true });
    for (const e of entries) {
      const rel = path.join(prefix, e.name);
      if (e.isDirectory()) walk(d, rel);
      else if (patterns.some((p) => (typeof p === "string" ? e.name === p : p.test(e.name)))) results.push(path.join(dir, rel).replace(/\\/g, "/"));
    }
  }
  walk(dir, ".");
  return results;
}

function globFind(dir, ext) {
  const results = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return results;
  function walk(prefix) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(full, prefix), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = path.join(prefix, e.name).replace(/\\/g, "/");
      if (e.isDirectory() && e.name !== "node_modules" && e.name !== ".git") walk(rel);
      else if (e.name.endsWith(ext)) results.push(path.join(dir, rel).replace(/\\/g, "/"));
    }
  }
  walk(".");
  return results;
}

function parsePrismaSchema() {
  const schemaPath = path.join(ROOT, "apps", "api", "prisma", "schema.prisma");
  const models = [];
  const enums = [];
  if (!fs.existsSync(schemaPath)) return { models, enums };
  const content = fs.readFileSync(schemaPath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^model\s+(\w+)/);
    if (m) models.push(m[1]);
    const e = line.match(/^enum\s+(\w+)/);
    if (e) enums.push(e[1]);
  }
  return { models, enums };
}

function grepRecursive(dir, pattern, maxLines = 300) {
  const results = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return results;
  const re = new RegExp(pattern, "gi");
  function walk(prefix) {
    let entries;
    try {
      entries = fs.readdirSync(path.join(full, prefix), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = path.join(prefix, e.name).replace(/\\/g, "/");
      if (e.isDirectory() && e.name !== "node_modules" && e.name !== ".git" && e.name !== "dist") walk(rel);
      else if (e.isFile() && /\.(ts|tsx|js|jsx|md|json)$/.test(e.name)) {
        if (results.length >= maxLines) return;
        try {
          const content = fs.readFileSync(path.join(full, prefix, e.name), "utf8");
          const lines = content.split(/\r?\n/);
          lines.forEach((line, i) => {
            if (re.test(line)) results.push({ file: path.join(dir, rel).replace(/\\/g, "/"), line: i + 1, text: line.trim().slice(0, 120) });
          });
        } catch (_) {}
      }
    }
  }
  walk(".");
  return results.slice(0, maxLines);
}

function duplicateBasenames() {
  const byName = new Map();
  const dirs = ["apps"];
  for (const d of dirs) {
    const full = path.join(ROOT, d);
    if (!fs.existsSync(full)) continue;
    function walk(prefix) {
      let entries;
      try {
        entries = fs.readdirSync(path.join(full, prefix), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = path.join(prefix, e.name).replace(/\\/g, "/");
        if (e.isDirectory() && e.name !== "node_modules" && e.name !== ".git" && e.name !== "dist") walk(rel);
        else if (e.isFile()) {
          const name = e.name;
          if (!byName.has(name)) byName.set(name, []);
          byName.get(name).push(path.join(d, rel).replace(/\\/g, "/"));
        }
      }
    }
    walk(".");
  }
  const duplicates = [];
  for (const [name, paths] of byName) {
    if (paths.length > 1) duplicates.push({ basename: name, paths });
  }
  return duplicates;
}

function suspiciousPartials(schema, webRoutes, apiFiles) {
  const partials = [];
  const routesSet = new Set(webRoutes.map((r) => r.replace(/\/page\.tsx$|\/route\.ts$/g, "").replace(/^apps\/web\/app/, "")));
  const apiRouteNames = new Set();
  apiFiles.forEach((f) => {
    if (f.includes("server.ts") || f.includes("routes/")) apiRouteNames.add(path.basename(f, path.extname(f)));
  });
  const models = new Set(schema.models);

  if (models.has("RecordsRequest") && !routesSet.has("/records-request") && !apiRouteNames.has("recordsRequest") && !apiRouteNames.has("recordsRequests")) partials.push({ type: "model_no_route", detail: "RecordsRequest model may have no API route" });
  if (models.has("RecordsRequest") && apiRouteNames.has("recordsRequests") && !routesSet.has("/dashboard/records-requests") && !routesSet.has("dashboard/records-requests")) partials.push({ type: "records_request_no_dashboard", detail: "RecordsRequest routes exist but dashboard page may be missing" });
  const hasFollowUpWorker = apiFiles.some((f) => f.includes("recordsRequestFollowUpWorker"));
  if (models.has("RecordsRequestFollowUpRule") && !hasFollowUpWorker) partials.push({ type: "records_request_no_followup_worker", detail: "RecordsRequestFollowUpRule exists but follow-up worker not found" });
  const hasPdfService = apiFiles.some((f) => f.includes("recordsRequestPdf") || f.includes("recordsLetterPdf"));
  if (models.has("RecordsRequest") && !hasPdfService) partials.push({ type: "records_request_no_pdf", detail: "RecordsRequest letter PDF generation service not found" });
  if (models.has("Provider") && !routesSet.has("/admin/providers") && !routesSet.has("/providers")) partials.push({ type: "model_may_missing_ui", detail: "Provider model — check admin/providers or providers page" });
  if (apiFiles.some((f) => f.includes("timeline") && f.includes("rebuild")) && !routesSet.has("/cases") && !routesSet.has("/debug")) partials.push({ type: "timeline_rebuild_ui", detail: "Timeline rebuild route exists; ensure case UI has rebuild button" });
  if (models.has("DemandPackage") && !routesSet.has("/demand") && !routesSet.has("/cases")) partials.push({ type: "demand_package_ui", detail: "DemandPackage model — check demand or case UI" });
  if (routesSet.has("debug/audit") || routesSet.has("/debug/audit")) {
    if (!fs.existsSync(path.join(ROOT, "audit", "latest_audit.json"))) partials.push({ type: "audit_json_missing", detail: "Debug audit page exists but latest_audit.json not generated; run pnpm run audit" });
  }

  return partials;
}

const TENANT_SCOPED_MODELS = new Set([
  "SavedView", "Job", "User", "ApiKey", "Document", "DocumentTag", "RoutingRule", "RoutingFeedback", "RoutingPattern",
  "RoutingScoreSnapshot", "ExtractionFeedback", "DocumentAuditEvent", "UsageMonthly", "Provider", "CaseProvider",
  "RecordsRequest", "RecordsRequestAttempt", "RecordsRequestAttachment", "RecordsRequestEvent", "RecordsRequestTemplate", "RecordsRequestFollowUpRule", "LegalCase", "CaseFinancial", "CaseNote", "CaseTask", "Referral",
  "CaseSummary", "CaseChecklistItem", "CasePacketExport", "CaseContact", "DemandPackage", "DemandPackageSectionSource",
  "ActivityFeedItem", "CrmPushLog", "CrmCaseMapping", "Notification", "ReviewQueueEvent", "WebhookEndpoint",
  "FirmIntegration", "MailboxConnection", "IntegrationSyncLog", "FieldMapping",
]);

function tenantSecurity(schemaPath, apiSrcDir) {
  const warnings = [];
  const schemaFull = path.join(ROOT, schemaPath);
  if (!fs.existsSync(schemaFull)) return warnings;
  const content = fs.readFileSync(schemaFull, "utf8");
  const modelBlocks = content.split(/^model\s+/m).slice(1);
  for (const block of modelBlocks) {
    const nameMatch = block.match(/^(\w+)/);
    if (!nameMatch) continue;
    const modelName = nameMatch[1];
    if (modelName === "Firm" || modelName === "SystemErrorLog" || modelName === "JobEvent") continue;
    if (TENANT_SCOPED_MODELS.has(modelName)) continue;
    if (block.includes("firmId") || block.includes("Firm @relation")) continue;
    if (/^DocumentVersion|^DocumentTagLink|^ProviderInvoice|^ProviderAccount|^ProviderInvite/.test(modelName)) continue;
    warnings.push({ type: "model_missing_firmId", detail: `Model ${modelName} may need firmId for tenant isolation` });
  }

  const apiSrc = path.join(ROOT, apiSrcDir);
  if (fs.existsSync(apiSrc)) {
    const serverPath = path.join(apiSrc, "http", "server.ts");
    if (fs.existsSync(serverPath)) {
      const serverContent = fs.readFileSync(serverPath, "utf8");
      const findUniqueWithoutFirm = serverContent.match(/\.findUnique\s*\(\s*\{\s*where:\s*\{\s*id:\s*[^}]+?\}\s*\)/g);
      if (findUniqueWithoutFirm && findUniqueWithoutFirm.length > 0) {
        findUniqueWithoutFirm.forEach((m, i) => {
          if (!m.includes("firmId")) warnings.push({ type: "findUnique_without_firm", detail: `server.ts: findUnique by id without firmId (risk ${i + 1})` });
        });
      }
      const riskyWhere = serverContent.match(/where:\s*\{\s*id:\s*[^}]+?\}/g);
      if (riskyWhere) {
        let count = 0;
        riskyWhere.forEach((m) => {
          if (!m.includes("firmId") && count < 5) { warnings.push({ type: "where_id_without_firm", detail: "server.ts: where { id } without firmId in same where" }); count++; }
        });
      }
    }
    const routeFiles = [];
    function walk(dir) {
      try {
        const entries = fs.readdirSync(path.join(apiSrc, dir), { withFileTypes: true });
        for (const e of entries) {
          const rel = path.join(dir, e.name);
          if (e.isDirectory() && e.name !== "node_modules" && e.name !== "dist") walk(rel);
          else if (e.isFile() && e.name.endsWith(".ts")) routeFiles.push(rel);
        }
      } catch (_) {}
    }
    walk("http/routes");
    routeFiles.forEach((f) => {
      const full = path.join(apiSrc, f);
      const c = fs.readFileSync(full, "utf8");
      if (c.includes("findMany") && !c.includes("firmId") && !c.includes("buildFirmWhere") && !c.includes("firmScopedWhere")) {
        warnings.push({ type: "route_missing_firm_filter", detail: `${f}: findMany without firmId/buildFirmWhere` });
      }
    });
  }

  // Document storage path check: keys should be tenant-namespaced (e.g. firmId in path)
  const storageFiles = ["apps/api/src/http/server.ts", "apps/api/src/services/ingestFromBuffer.ts", "apps/api/src/services/thumbnail.ts"];
  for (const rel of storageFiles) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const c = fs.readFileSync(full, "utf8");
    const putMatch = c.match(/putObject\s*\(\s*[^,]+/g);
    if (putMatch && !c.includes("firmId") && !c.includes("${firmId}")) {
      warnings.push({ type: "storage_path_may_skip_tenant", detail: `${rel}: putObject may not use firmId in key` });
    }
  }
  return warnings;
}

function platformStability(apiSrcDir) {
  const result = {
    securityHeaders: false,
    errorLogMiddleware: false,
    safeErrors: false,
    rateLimitedEndpoints: [],
    adminRequiresPlatformAdmin: false,
    supportBugReportFirmScoped: false,
    uploadValidation: false,
    requestGuards: false,
    systemHealth: false,
    warnings: [],
  };
  const apiSrc = path.join(ROOT, apiSrcDir);
  if (!fs.existsSync(apiSrc)) return result;

  const serverPath = path.join(apiSrc, "http", "server.ts");
  if (!fs.existsSync(serverPath)) return result;
  const serverContent = fs.readFileSync(serverPath, "utf8");

  result.securityHeaders = /securityHeaders|securityHeaders\s*\)/.test(serverContent);
  result.errorLogMiddleware = /errorLogMiddleware/.test(serverContent);
  result.safeErrors = /sendSafeError/.test(serverContent);
  const rateLimitMatches = serverContent.match(/rateLimit(?:Endpoint|ByIp)\s*\(\s*[^,]+,\s*["']([^"']+)["']\s*\)/g);
  if (rateLimitMatches) result.rateLimitedEndpoints = rateLimitMatches.map((m) => (m.match(/["']([^"']+)["']/) || [])[1]).filter(Boolean);
  result.adminRequiresPlatformAdmin = /requireRole\s*\(\s*Role\.PLATFORM_ADMIN\s*\)/.test(serverContent) && /\/admin\//.test(serverContent);
  result.supportBugReportFirmScoped = /\/support\/bug-report/.test(serverContent) && /firmId/.test(serverContent);
  result.uploadValidation = fs.existsSync(path.join(apiSrc, "services", "fileSecurityScan.ts")) && /validateUploadFile|fileSecurityScan/.test(serverContent);
  result.requestGuards = fs.existsSync(path.join(apiSrc, "http", "middleware", "requestGuards.ts")) && /validateIdParam|requestGuards/.test(serverContent);
  result.systemHealth = fs.existsSync(path.join(apiSrc, "services", "systemHealth.ts")) && /getSystemHealth|system\/health/.test(serverContent);

  if (!result.securityHeaders) result.warnings.push({ type: "security_headers", detail: "securityHeaders middleware not found" });
  if (!result.errorLogMiddleware) result.warnings.push({ type: "error_log", detail: "errorLogMiddleware not found" });
  if (!result.supportBugReportFirmScoped) result.warnings.push({ type: "support_firm", detail: "support/bug-report may not be firm-scoped" });
  if (!result.uploadValidation) result.warnings.push({ type: "upload_validation", detail: "Upload validation (fileSecurityScan) not found or not used" });
  return result;
}

function supportAndResilience(webAppDir, apiSrcDir) {
  const result = {
    supportReportPage: false,
    adminSupportPage: false,
    adminErrorsPage: false,
    adminBugReportsPage: false,
    retryOrReprocessMentions: [],
    warnings: [],
  };
  const webApp = path.join(ROOT, webAppDir);
  const apiSrc = path.join(ROOT, apiSrcDir);
  if (fs.existsSync(webApp)) {
    result.supportReportPage = fs.existsSync(path.join(webApp, "support", "report", "page.tsx"));
    result.adminSupportPage = fs.existsSync(path.join(webApp, "admin", "support", "page.tsx"));
    result.adminErrorsPage = fs.existsSync(path.join(webApp, "admin", "errors", "page.tsx"));
    result.adminBugReportsPage = fs.existsSync(path.join(webApp, "admin", "support", "bug-reports", "page.tsx"));
  }
  if (fs.existsSync(apiSrc)) {
    const serverPath = path.join(apiSrc, "http", "server.ts");
    if (fs.existsSync(serverPath)) {
      const content = fs.readFileSync(serverPath, "utf8");
      if (/retry|reprocess|re-run|reprocessDocument|retryJob/.test(content)) result.retryOrReprocessMentions.push("server.ts has retry/reprocess references");
    }
    const retryFiles = ["documentReprocess", "webhookRetry", "integrationSync", "recordsRequestSend", "ocr", "routing"];
    retryFiles.forEach((name) => {
      const found = grepRecursive(apiSrcDir, name, 5);
      if (found.length > 0) result.retryOrReprocessMentions.push(`${name} found in API`);
    });
  }
  if (!result.supportReportPage) result.warnings.push({ type: "support_report_page", detail: "apps/web/app/support/report/page.tsx not found" });
  if (!result.adminSupportPage) result.warnings.push({ type: "admin_support_page", detail: "apps/web/app/admin/support/page.tsx not found" });
  if (!result.adminErrorsPage) result.warnings.push({ type: "admin_errors_page", detail: "apps/web/app/admin/errors/page.tsx not found" });
  if (!result.adminBugReportsPage) result.warnings.push({ type: "admin_bug_reports_page", detail: "apps/web/app/admin/support/bug-reports/page.tsx not found" });
  return result;
}

function backupSystem(apiSrcDir) {
  const result = {
    backupWorkerExists: false,
    backupManagerExists: false,
    systemBackupModel: false,
    restoreEndpoint: false,
    healthIncludesBackup: false,
    warnings: [],
  };
  const apiSrc = path.join(ROOT, apiSrcDir);
  if (!fs.existsSync(apiSrc)) return result;

  result.backupWorkerExists = fs.existsSync(path.join(apiSrc, "workers", "backupWorker.ts"));
  result.backupManagerExists = fs.existsSync(path.join(apiSrc, "services", "backupManager.ts"));
  const serverPath = path.join(apiSrc, "http", "server.ts");
  if (fs.existsSync(serverPath)) {
    const content = fs.readFileSync(serverPath, "utf8");
    result.restoreEndpoint = /\/admin\/system\/restore\/:id|restoreFromBackup/.test(content);
    result.healthIncludesBackup = /backupStatus|getBackupStatus/.test(content);
  }
  const schemaPath = path.join(ROOT, "apps/api/prisma/schema.prisma");
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, "utf8");
    result.systemBackupModel = /model SystemBackup/.test(schema);
  }
  if (!result.backupWorkerExists) result.warnings.push({ type: "backup_worker", detail: "backupWorker.ts not found" });
  if (!result.backupManagerExists) result.warnings.push({ type: "backup_manager", detail: "backupManager.ts not found" });
  if (!result.systemBackupModel) result.warnings.push({ type: "backup_model", detail: "SystemBackup model not in schema" });
  if (!result.restoreEndpoint) result.warnings.push({ type: "restore_endpoint", detail: "Restore endpoint not found" });
  if (!result.healthIncludesBackup) result.warnings.push({ type: "health_backup", detail: "Health endpoint does not include backup info" });
  return result;
}

function main() {
  if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });

  const gitBranch = run("git rev-parse --abbrev-ref HEAD 2>/dev/null").stdout || "";
  const gitStatus = run("git status --short 2>/dev/null").stdout || "";
  const gitLog = run("git log -10 --oneline 2>/dev/null").stdout.split(/\n/).filter(Boolean);

  const webAppDir = path.join(ROOT, "apps", "web", "app");
  let webRoutes = [];
  let webPagesCount = 0;
  let webApiRoutes = [];
  if (fs.existsSync(webAppDir)) {
    webRoutes = globFind("apps/web/app", ".tsx").filter((f) => f.includes("page.tsx") || f.includes("layout.tsx"));
    webApiRoutes = globFind("apps/web/app", ".ts").filter((f) => f.includes("route.ts"));
    webPagesCount = webRoutes.filter((r) => r.endsWith("page.tsx")).length;
  }

  const apiFiles = globFind("apps/api/src", ".ts");
  const apiTsx = globFind("apps/api/src", ".tsx");
  const keyFiles = apiFiles.filter((f) => f.includes("server.ts") || f.includes("worker") || f.includes("prisma")).slice(0, 30);

  const { models, enums } = parsePrismaSchema();
  const migrationsDir = path.join(ROOT, "apps", "api", "prisma", "migrations");
  let migrationsTotal = 0;
  let migrationsList = [];
  if (fs.existsSync(migrationsDir)) {
    migrationsList = fs.readdirSync(migrationsDir).filter((n) => n !== "migration_lock.toml" && !n.startsWith("."));
    migrationsTotal = migrationsList.length;
  }
  const migrateStatus = run("cd apps/api && pnpm prisma migrate status 2>&1");
  const pendingMatch = migrateStatus.stdout.match(/pending/i) || migrateStatus.stderr.match(/pending/i);
  const pending = pendingMatch ? ["(check output: pending migrations may exist)"] : [];

  let webBuildOk = false;
  let apiTypecheckOk = false;
  const buildErrors = [];
  const webBuild = run("cd apps/web && pnpm run build 2>&1", { timeout: 120000 });
  webBuildOk = webBuild.ok;
  if (!webBuild.ok && webBuild.stdout) buildErrors.push({ component: "web", message: webBuild.stdout.slice(0, 500) });
  if (!webBuild.ok && webBuild.stderr) buildErrors.push({ component: "web", message: webBuild.stderr.slice(0, 500) });

  const apiTsc = run("cd apps/api && pnpm exec tsc --noEmit 2>&1", { timeout: 60000 });
  apiTypecheckOk = apiTsc.ok;
  if (!apiTsc.ok && (apiTsc.stdout || apiTsc.stderr)) buildErrors.push({ component: "api", message: (apiTsc.stdout || apiTsc.stderr).slice(0, 1500) });

  const todoMarkers = grepRecursive("apps", "TODO|FIXME|HACK|TEMP|NOT IMPLEMENTED|placeholder|coming soon", 150);
  const duplicateBasenamesList = duplicateBasenames();
  const suspiciousPartialsList = suspiciousPartials({ models, enums }, webRoutes, apiFiles);
  const tenantSecurityWarnings = tenantSecurity("apps/api/prisma/schema.prisma", "apps/api/src");
  const platformStabilityResult = platformStability("apps/api/src");
  const supportResilienceResult = supportAndResilience("apps/web/app", "apps/api/src");
  const backupSystemResult = backupSystem("apps/api/src");

  const audit = {
    generatedAt: new Date().toISOString(),
    git: { branch: gitBranch, status: gitStatus, recentCommits: gitLog },
    web: { routes: webRoutes, pagesCount: webPagesCount, apiRoutes: webApiRoutes },
    api: { filesCount: apiFiles.length + apiTsx.length, keyFiles },
    db: {
      models,
      enums,
      migrations: { total: migrationsTotal, pending, statusText: migrateStatus.stdout || migrateStatus.stderr || "" },
    },
    build: {
      webBuildOk,
      apiTypecheckOk,
      errors: buildErrors,
    },
    codeHealth: {
      todoMarkers: todoMarkers.slice(0, 80),
      duplicateBasenames: duplicateBasenamesList.slice(0, 30),
      suspiciousPartials: suspiciousPartialsList,
    },
    tenantSecurity: {
      warnings: tenantSecurityWarnings,
      summary: tenantSecurityWarnings.length ? `${tenantSecurityWarnings.length} tenant isolation warning(s)` : "OK",
    },
    platformStability: {
      securityHeaders: platformStabilityResult.securityHeaders,
      errorLogMiddleware: platformStabilityResult.errorLogMiddleware,
      safeErrors: platformStabilityResult.safeErrors,
      rateLimitedEndpoints: platformStabilityResult.rateLimitedEndpoints,
      adminRequiresPlatformAdmin: platformStabilityResult.adminRequiresPlatformAdmin,
      supportBugReportFirmScoped: platformStabilityResult.supportBugReportFirmScoped,
      uploadValidation: platformStabilityResult.uploadValidation,
      requestGuards: platformStabilityResult.requestGuards,
      systemHealth: platformStabilityResult.systemHealth,
      warnings: platformStabilityResult.warnings,
    },
    supportAndResilience: {
      supportReportPage: supportResilienceResult.supportReportPage,
      adminSupportPage: supportResilienceResult.adminSupportPage,
      adminErrorsPage: supportResilienceResult.adminErrorsPage,
      adminBugReportsPage: supportResilienceResult.adminBugReportsPage,
      retryOrReprocessMentions: supportResilienceResult.retryOrReprocessMentions,
      warnings: supportResilienceResult.warnings,
    },
    backupSystem: {
      backupWorkerExists: backupSystemResult.backupWorkerExists,
      backupManagerExists: backupSystemResult.backupManagerExists,
      systemBackupModel: backupSystemResult.systemBackupModel,
      restoreEndpoint: backupSystemResult.restoreEndpoint,
      healthIncludesBackup: backupSystemResult.healthIncludesBackup,
      warnings: backupSystemResult.warnings,
    },
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(audit, null, 2), "utf8");
  console.log("Audit JSON written to", OUT_JSON);

  const txtPath = path.join(AUDIT_DIR, "latest_audit.txt");
  const txtLines = [
    "FULL PROJECT AUDIT (summary from full_audit.js)",
    "Generated: " + audit.generatedAt,
    "",
    "Git branch: " + (audit.git.branch || "—") + " | Status: " + (audit.git.status ? "dirty" : "clean"),
    "Web: pages=" + audit.web.pagesCount + " apiRoutes=" + (audit.web.apiRoutes || []).length,
    "API: files=" + audit.api.filesCount,
    "DB: models=" + audit.db.models.length + " enums=" + audit.db.enums.length + " migrations=" + audit.db.migrations.total + " pending=" + (audit.db.migrations.pending || []).length,
    "Build: web=" + (audit.build.webBuildOk ? "OK" : "FAIL") + " apiTypecheck=" + (audit.build.apiTypecheckOk ? "OK" : "FAIL"),
    "TODO markers: " + audit.codeHealth.todoMarkers.length + " | Duplicate basenames: " + audit.codeHealth.duplicateBasenames.length + " | Suspicious partials: " + audit.codeHealth.suspiciousPartials.length,
    "Tenant security: " + (audit.tenantSecurity.summary || (audit.tenantSecurity.warnings && audit.tenantSecurity.warnings.length > 0 ? audit.tenantSecurity.warnings.length + " warning(s)" : "OK")),
    "Platform stability: securityHeaders=" + (audit.platformStability.securityHeaders ? "yes" : "no") + " errorLog=" + (audit.platformStability.errorLogMiddleware ? "yes" : "no") + " rateLimit=" + (audit.platformStability.rateLimitedEndpoints || []).length + " systemHealth=" + (audit.platformStability.systemHealth ? "yes" : "no"),
    "Support: reportPage=" + (audit.supportAndResilience.supportReportPage ? "yes" : "no") + " adminSupport=" + (audit.supportAndResilience.adminSupportPage ? "yes" : "no") + " adminErrors=" + (audit.supportAndResilience.adminErrorsPage ? "yes" : "no") + " bugReports=" + (audit.supportAndResilience.adminBugReportsPage ? "yes" : "no"),
    "Backup: worker=" + (audit.backupSystem.backupWorkerExists ? "yes" : "no") + " manager=" + (audit.backupSystem.backupManagerExists ? "yes" : "no") + " model=" + (audit.backupSystem.systemBackupModel ? "yes" : "no") + " restore=" + (audit.backupSystem.restoreEndpoint ? "yes" : "no") + " healthBackup=" + (audit.backupSystem.healthIncludesBackup ? "yes" : "no"),
    "",
    "Top issues:",
    ...audit.build.errors.slice(0, 3).map((e) => "  [BUILD] " + (e.message || "").split("\n")[0]),
    ...audit.codeHealth.suspiciousPartials.slice(0, 5).map((s) => "  [PARTIAL] " + (s.detail || s.type)),
    ...(audit.tenantSecurity.warnings && audit.tenantSecurity.warnings.length > 0 ? audit.tenantSecurity.warnings.slice(0, 5).map((w) => "  [TENANT] " + (w.detail || w.type)) : []),
  ];
  fs.writeFileSync(txtPath, txtLines.join("\n"), "utf8");
  console.log("Audit summary written to", txtPath);

  console.log("Summary: models=" + models.length + " enums=" + enums.length + " webPages=" + webPagesCount + " apiFiles=" + audit.api.filesCount);
  console.log("Build: web=" + (webBuildOk ? "OK" : "FAIL") + " apiTypecheck=" + (apiTypecheckOk ? "OK" : "FAIL"));
  console.log("TODO markers:", todoMarkers.length, "| Duplicate basenames:", duplicateBasenamesList.length, "| Suspicious partials:", suspiciousPartialsList.length);
  if (tenantSecurityWarnings.length > 0) console.log("Tenant security:", tenantSecurityWarnings.length, "warning(s) — see audit.tenantSecurity.warnings");
  const ps = platformStabilityResult;
  console.log("Platform stability: securityHeaders=" + ps.securityHeaders + " errorLog=" + ps.errorLogMiddleware + " rateLimitEndpoints=" + (ps.rateLimitedEndpoints || []).length + " systemHealth=" + ps.systemHealth);
  if ((ps.warnings || []).length > 0) console.log("Platform stability warnings:", ps.warnings.length);
  const sr = supportResilienceResult;
  console.log("Support: reportPage=" + sr.supportReportPage + " adminSupport=" + sr.adminSupportPage + " adminErrors=" + sr.adminErrorsPage + " bugReports=" + sr.adminBugReportsPage);
}

main();
