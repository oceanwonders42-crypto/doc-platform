import Link from "next/link";
import IngestTest from "./IngestTest";

const baseUrl = process.env.DOC_WEB_BASE_URL || "http://localhost:3000";

async function fetchPing(): Promise<{ ok: boolean; status: number; latencyMs: number | null; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/debug/ping`, { cache: "no-store" });
    const data = await res.json();
    return data;
  } catch (e) {
    return { ok: false, status: 0, latencyMs: null, error: String(e) };
  }
}

async function fetchStatus(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/debug/status`, { cache: "no-store" });
    const data = await res.json();
    return data;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export default async function AdminDebugPage() {
  const [ping, status] = await Promise.all([fetchPing(), fetchStatus()]);
  const isProd = process.env.NODE_ENV === "production";

  const docApiUrl = process.env.DOC_API_URL || "(not set)";
  const docApiKeySet = !!(process.env.DOC_API_KEY && process.env.DOC_API_KEY.trim());

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
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Web config</h2>
        <dl style={{ margin: 0, fontSize: 14 }}>
          <dt style={{ color: "#666", marginBottom: 4 }}>DOC_API_URL</dt>
          <dd style={{ margin: "0 0 12px 0", fontFamily: "monospace", wordBreak: "break-all" }}>
            {docApiUrl}
          </dd>
          <dt style={{ color: "#666", marginBottom: 4 }}>DOC_API_KEY</dt>
          <dd style={{ margin: 0 }}>
            {docApiKeySet ? (
              <span style={{ color: "green" }}>Set (hidden)</span>
            ) : (
              <span style={{ color: "#c00" }}>Not set</span>
            )}
          </dd>
        </dl>
      </section>

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
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>DB / system status</h2>
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
