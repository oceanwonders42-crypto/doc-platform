/**
 * One-command system check: web, API, web->api proxy, env vars.
 * Run from repo root or apps/api: pnpm -C apps/api run doctor
 * Exit code: 0 if all critical checks pass, 1 otherwise.
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

const API_HOST = "127.0.0.1";
const API_PORT = 4000;
const WEB_PORTS = [3000, 3001];

type Check = { name: string; pass: boolean; detail?: string };

type ResolvedWebApp = {
  webDir: string | null;
  source: "override" | "apps/web" | null;
  searched: string[];
};

function readEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!fs.existsSync(filePath)) return out;
    const raw = fs.readFileSync(filePath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  } catch {
    // ignore
  }
  return out;
}

function directoryExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function resolveWebAppDir(apiDir: string): ResolvedWebApp {
  const override = process.env.WEB_APP_PATH?.trim();
  if (override) {
    return {
      webDir: path.resolve(override),
      source: "override",
      searched: [path.resolve(override)],
    };
  }

  const repoRoot = path.resolve(apiDir, "..", "..");
  const standardWebDir = path.join(repoRoot, "apps", "web");
  const searched = [standardWebDir];

  if (directoryExists(standardWebDir)) {
    return { webDir: standardWebDir, source: "apps/web", searched };
  }

  return { webDir: null, source: null, searched };
}

function envChecks(apiDir: string, resolvedWebApp: ResolvedWebApp): Check[] {
  const checks: Check[] = [];
  const apiEnvPath = path.join(apiDir, ".env");
  const webEnvPath = resolvedWebApp.webDir ? path.join(resolvedWebApp.webDir, ".env.local") : null;

  const webEnv = webEnvPath ? readEnvFile(webEnvPath) : {};
  const apiEnv = readEnvFile(apiEnvPath);

  const webHasApiUrl = !!(webEnv.DOC_API_URL && webEnv.DOC_API_URL.trim());
  const webHasApiKey = !!(webEnv.DOC_API_KEY && webEnv.DOC_API_KEY.trim());
  const apiHasDb = !!(apiEnv.DATABASE_URL && apiEnv.DATABASE_URL.trim());
  const apiHasKey = !!(apiEnv.DOC_API_KEY && apiEnv.DOC_API_KEY.trim());

  if (!webHasApiUrl || !webHasApiKey) {
    const detail = webEnvPath
      ? `${path.relative(apiDir, webEnvPath) || webEnvPath} should have DOC_API_URL and DOC_API_KEY`
      : `Could not resolve active web app path. Checked: ${resolvedWebApp.searched.join(", ")}`;
    checks.push({
      name: "ENV (web)",
      pass: false,
      detail,
    });
  } else {
    checks.push({
      name: "ENV (web)",
      pass: true,
      detail: resolvedWebApp.source === "override" ? `WEB_APP_PATH -> ${webEnvPath}` : webEnvPath ?? undefined,
    });
  }

  if (!apiHasDb) {
    checks.push({
      name: "ENV (api)",
      pass: false,
      detail: "apps/api/.env should have DATABASE_URL",
    });
  } else {
    checks.push({ name: "ENV (api)", pass: true, detail: apiHasKey ? "DOC_API_KEY present" : "DOC_API_KEY optional" });
  }

  return checks;
}

async function fetchOk(url: string, timeoutMs = 5000): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function detectWebPort(): Promise<{ port: number | null; ok: boolean }> {
  for (const port of WEB_PORTS) {
    const url = `http://${API_HOST}:${port}/healthz`;
    const r = await fetchOk(url);
    if (r.ok || r.status === 200) return { port, ok: true };
  }
  for (const port of WEB_PORTS) {
    const url = `http://${API_HOST}:${port}/dashboard`;
    const r = await fetchOk(url);
    if (r.ok || r.status === 200 || r.status === 307 || r.status === 308) return { port, ok: true };
  }
  return { port: null, ok: false };
}

async function run(): Promise<{ checks: Check[]; exitCode: number }> {
  const checks: Check[] = [];
  const apiDir = path.resolve(path.join(__dirname, ".."));
  const resolvedWebApp = resolveWebAppDir(apiDir);

  // 1) Env vars (read files, no crash)
  const envResults = envChecks(apiDir, resolvedWebApp);
  checks.push(...envResults);

  // 2) API health
  const apiUrl = `http://${API_HOST}:${API_PORT}/health`;
  const apiRes = await fetchOk(apiUrl);
  const apiPass = apiRes.ok && apiRes.status === 200;
  checks.push({
    name: "API",
    pass: apiPass,
    detail: apiPass ? undefined : (apiRes.error || `status=${apiRes.status}`),
  });

  // 3) Web (detect port)
  const webDetect = await detectWebPort();
  checks.push({
    name: "WEB",
    pass: webDetect.ok && webDetect.port != null,
    detail: webDetect.port != null ? `port ${webDetect.port}` : (webDetect.ok ? "no healthz/dashboard" : "not reachable"),
  });

  const webPort = webDetect.port ?? WEB_PORTS[0];

  // 4) Proxy /api/cases
  const proxyCasesUrl = `http://${API_HOST}:${webPort}/api/cases`;
  const proxyCasesRes = await fetchOk(proxyCasesUrl);
  const proxyCasesPass = proxyCasesRes.status !== undefined && proxyCasesRes.status < 500 && !proxyCasesRes.error;
  checks.push({
    name: "PROXY /api/cases",
    pass: proxyCasesPass,
    detail: proxyCasesPass ? undefined : (proxyCasesRes.error || `status=${proxyCasesRes.status}`),
  });

  // 5) Proxy /api/documents
  const proxyDocsUrl = `http://${API_HOST}:${webPort}/api/documents`;
  const proxyDocsRes = await fetchOk(proxyDocsUrl);
  const proxyDocsPass = proxyDocsRes.status !== undefined && proxyDocsRes.status < 500 && !proxyDocsRes.error;
  checks.push({
    name: "PROXY /api/documents",
    pass: proxyDocsPass,
    detail: proxyDocsPass ? undefined : (proxyDocsRes.error || `status=${proxyDocsRes.status}`),
  });

  const critical = ["API", "WEB", "PROXY /api/cases", "PROXY /api/documents"];
  const criticalFail = checks.some((c) => critical.includes(c.name) && !c.pass);
  const exitCode = criticalFail ? 1 : 0;

  return { checks, exitCode };
}

function main() {
  run()
    .then(({ checks, exitCode }) => {
      for (const c of checks) {
        const label = c.pass ? "PASS" : "FAIL";
        const detail = c.detail ? ` (${c.detail})` : "";
        console.log(`${label}  ${c.name}${detail}`);
      }
      const envChecks = checks.filter((c) => c.name.startsWith("ENV"));
      const envMissing = envChecks.some((c) => !c.pass);
      if (envMissing) {
        console.log("ENV: WARN — some env vars missing (see above)");
      }
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error("Doctor error:", err);
      process.exit(1);
    });
}

main();
