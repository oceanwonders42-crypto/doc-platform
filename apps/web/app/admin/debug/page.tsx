import Link from "next/link";
import IngestTest from "./IngestTest";
import { getBuildInfo } from "../../../lib/buildInfo";

const baseUrl = process.env.DOC_WEB_BASE_URL || "http://localhost:3000";
const docApiUrl = process.env.DOC_API_URL || "";

type VersionPayload = {
  ok: boolean;
  service: string;
  versionLabel: string;
  packageName: string;
  packageVersion: string;
  commitHash: string;
  shortCommitHash: string;
  buildTime: string | null;
  buildSource: string;
  buildBranch: string | null;
  buildDirty: boolean | null;
  nodeEnv: string;
};

type CheckStatus = "pass" | "warn" | "fail";

type StatusCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

type StatusResponse = {
  ok: boolean;
  error?: string;
  summary?: {
    failureCount: number;
    warningCount: number;
    passCount: number;
  };
  env?: {
    nodeEnv?: string;
    docApiUrl?: string | null;
    docApiKeySet?: boolean;
    nextPublicApiUrl?: string | null;
    docWebBaseUrl?: string | null;
    apiTargetsMatch?: boolean | null;
  };
  apiHealth?: {
    ok: boolean;
    status: number;
    error: string | null;
  };
  featureFlags?: {
    ok: boolean;
    error: string | null;
    flags: {
      insuranceExtraction: boolean | null;
      courtExtraction: boolean | null;
      demandNarratives: boolean | null;
      duplicatesDetection: boolean | null;
      emailAutomation: boolean | null;
    };
  };
  checks?: StatusCheck[];
};

async function fetchPing(): Promise<{ ok: boolean; status: number; latencyMs: number | null; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/debug/ping`, { cache: "no-store" });
    const data = await res.json();
    return data;
  } catch (e) {
    return { ok: false, status: 0, latencyMs: null, error: String(e) };
  }
}

async function fetchStatus(): Promise<StatusResponse> {
  try {
    const res = await fetch(`${baseUrl}/api/debug/status`, { cache: "no-store" });
    const data = await res.json();
    return data;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function valueOrFallback(value: string | null | undefined): string {
  return value && value.trim() ? value : "(not set)";
}

function toneColor(status: CheckStatus): string {
  if (status === "pass") return "green";
  if (status === "warn") return "#b45309";
  return "#c00";
}

function toneLabel(status: CheckStatus): string {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

async function fetchApiVersion(): Promise<{
  ok: boolean;
  status: number;
  version?: VersionPayload;
  error?: string;
}> {
  if (!docApiUrl.trim()) {
    return {
      ok: false,
      status: 0,
      error: "DOC_API_URL not set",
    };
  }

  try {
    const res = await fetch(`${docApiUrl.replace(/\/$/, "")}/version`, { cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Version request failed: ${res.status}`,
      };
    }

    const data = (await res.json()) as VersionPayload;
    return { ok: true, status: res.status, version: data };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

function VersionValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt style={{ color: "#666", marginBottom: 4 }}>{label}</dt>
      <dd
        style={{
          margin: "0 0 12px 0",
          fontFamily: mono ? "monospace" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {value}
      </dd>
    </>
  );
}

function VersionCard({
  title,
  endpoint,
  version,
  error,
}: {
  title: string;
  endpoint: string;
  version?: VersionPayload | null;
  error?: string;
}) {
  return (
    <section
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      <dl style={{ margin: 0, fontSize: 14 }}>
        <VersionValue label="Endpoint" value={endpoint} mono />
        {version ? (
          <>
            <VersionValue label="Service" value={version.service} />
            <VersionValue label="Version Label" value={version.versionLabel} mono />
            <VersionValue label="Package" value={`${version.packageName}@${version.packageVersion}`} mono />
            <VersionValue label="Git SHA" value={version.commitHash} mono />
            <VersionValue label="Short SHA" value={version.shortCommitHash} mono />
            <VersionValue label="Build Timestamp" value={version.buildTime ?? "unknown"} mono />
            <VersionValue label="Build Source" value={version.buildSource} mono />
            <VersionValue label="Branch" value={version.buildBranch ?? "unknown"} mono />
            <VersionValue
              label="Dirty"
              value={
                version.buildDirty === null ? "unknown" : version.buildDirty ? "true" : "false"
              }
              mono
            />
            <VersionValue label="Node Env" value={version.nodeEnv} mono />
          </>
        ) : (
          <VersionValue label="Status" value={error ?? "Unavailable"} />
        )}
      </dl>
    </section>
  );
}

export default async function AdminDebugPage() {
  const webBuild = getBuildInfo();
  const webVersion: VersionPayload = {
    ok: true,
    service: "web",
    versionLabel: webBuild.versionLabel,
    packageName: webBuild.packageName,
    packageVersion: webBuild.packageVersion,
    commitHash: webBuild.sha,
    shortCommitHash: webBuild.shortSha,
    buildTime: webBuild.builtAt,
    buildSource: webBuild.source,
    buildBranch: webBuild.branch,
    buildDirty: webBuild.dirty,
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
  const [ping, status, apiVersion] = await Promise.all([fetchPing(), fetchStatus(), fetchApiVersion()]);
  const isProd = process.env.NODE_ENV === "production";
  const checks = status.checks ?? [];
  const flags = status.featureFlags?.flags ?? null;

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Admin Debug</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        System health and config (server-side). Use for local/dev troubleshooting.
      </p>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Runtime config</h2>
        <dl style={{ margin: 0, fontSize: 14 }}>
          <dt style={{ color: "#666", marginBottom: 4 }}>DOC_API_URL</dt>
          <dd style={{ margin: "0 0 12px 0", fontFamily: "monospace", wordBreak: "break-all" }}>
            {valueOrFallback(status.env?.docApiUrl)}
          </dd>
          <dt style={{ color: "#666", marginBottom: 4 }}>DOC_API_KEY</dt>
          <dd style={{ margin: "0 0 12px 0" }}>
            {status.env?.docApiKeySet ? (
              <span style={{ color: "green" }}>Set (hidden)</span>
            ) : (
              <span style={{ color: "#c00" }}>Not set</span>
            )}
          </dd>
          <dt style={{ color: "#666", marginBottom: 4 }}>NEXT_PUBLIC_API_URL</dt>
          <dd style={{ margin: "0 0 12px 0", fontFamily: "monospace", wordBreak: "break-all" }}>
            {valueOrFallback(status.env?.nextPublicApiUrl)}
          </dd>
          <dt style={{ color: "#666", marginBottom: 4 }}>DOC_WEB_BASE_URL</dt>
          <dd style={{ margin: "0 0 12px 0", fontFamily: "monospace", wordBreak: "break-all" }}>
            {valueOrFallback(status.env?.docWebBaseUrl)}
          </dd>
          <dt style={{ color: "#666", marginBottom: 4 }}>Target match</dt>
          <dd style={{ margin: 0 }}>
            {status.env?.apiTargetsMatch === true ? (
              <span style={{ color: "green" }}>DOC_API_URL and NEXT_PUBLIC_API_URL match</span>
            ) : status.env?.apiTargetsMatch === false ? (
              <span style={{ color: "#c00" }}>DOC_API_URL and NEXT_PUBLIC_API_URL differ</span>
            ) : (
              <span style={{ color: "#b45309" }}>Not enough config to compare</span>
            )}
          </dd>
        </dl>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#666" }}>
          <code>NEXT_PUBLIC_API_URL</code> is baked into the browser bundle at build time. If it looks correct here but client requests still go elsewhere, redeploy the web app so the client bundle refreshes.
        </p>
      </section>

      <VersionCard title="Web Version" endpoint="/version" version={webVersion} />
      <VersionCard
        title="API Version"
        endpoint={docApiUrl.trim() ? `${docApiUrl.replace(/\/$/, "")}/version` : "DOC_API_URL not set"}
        version={apiVersion.version ?? null}
        error={apiVersion.error}
      />

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>API reachability</h2>
        <p style={{ margin: 0, fontSize: 14 }}>
          <strong>Ping:</strong>{" "}
          {ping.ok ? (
            <span style={{ color: "green" }}>OK</span>
          ) : (
            <span style={{ color: "#c00" }}>FAIL</span>
          )}
          {ping.latencyMs != null && ` (${ping.latencyMs} ms)`}
          {ping.error && (
            <span style={{ color: "#666", marginLeft: 8 }}>- {ping.error}</span>
          )}
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 14 }}>
          <strong>Authenticated health:</strong>{" "}
          {status.apiHealth?.ok ? (
            <span style={{ color: "green" }}>OK</span>
          ) : (
            <span style={{ color: "#c00" }}>FAIL</span>
          )}
          {status.apiHealth?.status ? ` (HTTP ${status.apiHealth.status})` : ""}
          {status.apiHealth?.error && (
            <span style={{ color: "#666", marginLeft: 8 }}>- {status.apiHealth.error}</span>
          )}
        </p>
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Runtime checks</h2>
        <p style={{ margin: 0, fontSize: 14 }}>
          <strong>Status:</strong>{" "}
          {status.ok ? (
            <span style={{ color: "green" }}>OK</span>
          ) : (
            <span style={{ color: "#c00" }}>FAIL</span>
          )}
          {status.error && (
            <span style={{ color: "#666", marginLeft: 8 }}>- {status.error}</span>
          )}
        </p>
        {status.summary && (
          <p style={{ margin: "8px 0 0", fontSize: 14, color: "#666" }}>
            {status.summary.passCount} pass, {status.summary.warningCount} warn, {status.summary.failureCount} fail
          </p>
        )}
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {checks.map((check) => (
            <div
              key={check.id}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 10,
                padding: 12,
                background: check.status === "warn" ? "#fffbeb" : "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span
                  style={{
                    color: "#fff",
                    background: toneColor(check.status),
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {toneLabel(check.status)}
                </span>
                <strong style={{ fontSize: 14 }}>{check.label}</strong>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "#666" }}>{check.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Feature flags</h2>
        {status.featureFlags?.ok && flags ? (
          <dl style={{ margin: 0, fontSize: 14 }}>
            <dt style={{ color: "#666", marginBottom: 4 }}>email_automation</dt>
            <dd style={{ margin: "0 0 12px 0" }}>{String(flags.emailAutomation)}</dd>
            <dt style={{ color: "#666", marginBottom: 4 }}>insurance_extraction</dt>
            <dd style={{ margin: "0 0 12px 0" }}>{String(flags.insuranceExtraction)}</dd>
            <dt style={{ color: "#666", marginBottom: 4 }}>court_extraction</dt>
            <dd style={{ margin: "0 0 12px 0" }}>{String(flags.courtExtraction)}</dd>
            <dt style={{ color: "#666", marginBottom: 4 }}>demand_narratives</dt>
            <dd style={{ margin: "0 0 12px 0" }}>{String(flags.demandNarratives)}</dd>
            <dt style={{ color: "#666", marginBottom: 4 }}>duplicates_detection</dt>
            <dd style={{ margin: 0 }}>{String(flags.duplicatesDetection)}</dd>
          </dl>
        ) : (
          <p style={{ margin: 0, fontSize: 14 }}>
            <span style={{ color: "#c00" }}>Unavailable</span>
            {status.featureFlags?.error && (
              <span style={{ color: "#666", marginLeft: 8 }}>- {status.featureFlags.error}</span>
            )}
          </p>
        )}
      </section>

      <IngestTest />

      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Quick links</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li style={{ marginBottom: 8 }}>
            <Link href="/onboarding" style={{ color: "#111", textDecoration: "underline" }}>
              /onboarding - Firm onboarding wizard
            </Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/admin/firms" style={{ color: "#111", textDecoration: "underline" }}>
              /admin/firms - Platform firms list
            </Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/admin/dashboard" style={{ color: "#111", textDecoration: "underline" }}>
              /admin/dashboard - Platform firms &amp; usage
            </Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/admin/errors" style={{ color: "#111", textDecoration: "underline" }}>
              /admin/errors - System error log
            </Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/admin/quality" style={{ color: "#111", textDecoration: "underline" }}>
              /admin/quality - Quality control metrics
            </Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/admin/jobs" style={{ color: "#111", textDecoration: "underline" }}>
              /admin/jobs - Background jobs
            </Link>
          </li>
          {!isProd && (
            <li style={{ marginBottom: 8 }}>
              <Link href="/admin/demo" style={{ color: "#111", textDecoration: "underline" }}>
                /admin/demo - One-click demo seed
              </Link>
            </li>
          )}
          <li style={{ marginBottom: 8 }}>
            <Link href="/dashboard/review" style={{ color: "#111", textDecoration: "underline" }}>
              /dashboard/review
            </Link>
          </li>
          <li style={{ marginBottom: 8 }}>
            <Link href="/providers" style={{ color: "#111", textDecoration: "underline" }}>
              /providers
            </Link>
          </li>
          <li>
            <Link href="/dashboard/metrics" style={{ color: "#111", textDecoration: "underline" }}>
              /dashboard/metrics
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
