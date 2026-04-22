import Link from "next/link";

type FirmRow = {
  firmId: string;
  firmName: string;
  status: string;
  plan: string;
  pageLimitMonthly: number;
  createdAt: string;
  documentsProcessed?: number;
  activeUsers?: number;
  usageStats?: {
    documentsProcessed: number;
    narrativeGenerated: number;
    pagesProcessed: number;
  };
};

type AdminFirmsResponse = {
  ok: boolean;
  firms: FirmRow[];
  error?: string;
};

async function fetchAdminFirms(): Promise<AdminFirmsResponse> {
  const base = process.env.DOC_API_URL;
  const key = process.env.PLATFORM_ADMIN_API_KEY;
  if (!base || !key) {
    throw new Error("DOC_API_URL or PLATFORM_ADMIN_API_KEY not set");
  }
  const res = await fetch(`${base}/admin/firms`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, firms: [], error: data?.error || `HTTP ${res.status}` };
  }
  return data as AdminFirmsResponse;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function AdminFirmsPage() {
  let data: AdminFirmsResponse;
  try {
    data = await fetchAdminFirms();
  } catch (e) {
    return (
      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
            ← Admin
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Platform firms</h1>
        </div>
        <p style={{ color: "#c00" }}>{e instanceof Error ? e.message : String(e)}</p>
      </main>
    );
  }

  if (!data.ok || data.error) {
    return (
      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
            ← Admin
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Platform firms</h1>
        </div>
        <p style={{ color: "#c00" }}>{data.error ?? "Failed to load firms"}</p>
      </main>
    );
  }

  const firms = data.firms;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
            ← Admin
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Platform firms</h1>
        <Link
          href="/onboarding"
          style={{
            marginLeft: "auto",
            padding: "8px 14px",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          New firm
        </Link>
      </div>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        All firms. Click a firm for details, users, API keys, and usage.
      </p>

      <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f9f9f9", textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "12px 10px" }}>Firm</th>
              <th style={{ padding: "12px 10px" }}>Status</th>
              <th style={{ padding: "12px 10px" }}>Plan</th>
              <th style={{ padding: "12px 10px" }}>Page limit</th>
              <th style={{ padding: "12px 10px" }}>Created</th>
              <th style={{ padding: "12px 10px" }}>Pages (usage)</th>
              <th style={{ padding: "12px 10px" }}></th>
            </tr>
          </thead>
          <tbody>
            {firms.map((f) => (
              <tr key={f.firmId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px" }}>
                  <span style={{ fontWeight: 600 }}>{f.firmName}</span>
                  <div style={{ fontSize: 12, color: "#888" }}>{f.firmId}</div>
                </td>
                <td style={{ padding: "10px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 12,
                      background: f.status === "active" ? "#e8f5e9" : "#fff3e0",
                      color: f.status === "active" ? "#2e7d32" : "#e65100",
                    }}
                  >
                    {f.status}
                  </span>
                </td>
                <td style={{ padding: "10px" }}>{f.plan}</td>
                <td style={{ padding: "10px" }}>{f.pageLimitMonthly.toLocaleString()}</td>
                <td style={{ padding: "10px" }}>{formatDate(f.createdAt)}</td>
                <td style={{ padding: "10px" }}>
                  {(f.usageStats?.pagesProcessed ?? 0).toLocaleString()}
                </td>
                <td style={{ padding: "10px" }}>
                  <Link
                    href={`/admin/firms/${f.firmId}`}
                    style={{ fontSize: 13, color: "#1565c0", textDecoration: "underline" }}
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {firms.length === 0 && (
        <p style={{ padding: 16, color: "#666", margin: 0 }}>No firms yet.</p>
      )}
    </main>
  );
}
