import Link from "next/link";

type FirmRow = {
  firmId: string;
  firmName: string;
  documentsProcessed: number;
  activeUsers: number;
  usageStats: {
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

export default async function AdminDashboardPage() {
  let data: AdminFirmsResponse;
  try {
    data = await fetchAdminFirms();
  } catch (e) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
            ← Admin
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
        </div>
        <p style={{ color: "#c00" }}>{e instanceof Error ? e.message : String(e)}</p>
      </main>
    );
  }

  if (!data.ok || data.error) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
            ← Admin
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
        </div>
        <p style={{ color: "#c00" }}>{data.error ?? "Failed to load firms"}</p>
      </main>
    );
  }

  const firms = data.firms;
  const totalFirms = firms.length;
  const totalDocumentsProcessed = firms.reduce((s, f) => s + (f.usageStats?.documentsProcessed ?? f.documentsProcessed ?? 0), 0);
  const totalNarrativesGenerated = firms.reduce((s, f) => s + (f.usageStats?.narrativeGenerated ?? 0), 0);

  return (
    <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Admin
        </Link>
        <Link href="/admin/firms" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          Firms
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Admin Dashboard</h1>
      </div>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Platform-wide metrics. All firms. <Link href="/admin/firms" style={{ color: "#1565c0", textDecoration: "underline" }}>View firms list →</Link>
      </p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Total firms</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{totalFirms}</div>
        </div>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Documents processed</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{totalDocumentsProcessed.toLocaleString()}</div>
        </div>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>AI narratives generated</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{totalNarrativesGenerated.toLocaleString()}</div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Firms</h2>
        <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f9f9f9", textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "12px 10px" }}>Firm</th>
                <th style={{ padding: "12px 10px" }}>Documents</th>
                <th style={{ padding: "12px 10px" }}>Active users</th>
                <th style={{ padding: "12px 10px" }}>Docs processed (usage)</th>
                <th style={{ padding: "12px 10px" }}>Narratives</th>
                <th style={{ padding: "12px 10px" }}>Pages</th>
              </tr>
            </thead>
            <tbody>
              {firms.map((f) => (
                <tr key={f.firmId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px" }}>
                    <Link href={`/admin/firms/${f.firmId}`} style={{ color: "#111", textDecoration: "underline" }}>
                      <span style={{ fontWeight: 600 }}>{f.firmName}</span>
                    </Link>
                    <div style={{ fontSize: 12, color: "#888" }}>{f.firmId}</div>
                  </td>
                  <td style={{ padding: "10px" }}>{f.documentsProcessed.toLocaleString()}</td>
                  <td style={{ padding: "10px" }}>{f.activeUsers}</td>
                  <td style={{ padding: "10px" }}>{(f.usageStats?.documentsProcessed ?? 0).toLocaleString()}</td>
                  <td style={{ padding: "10px" }}>{(f.usageStats?.narrativeGenerated ?? 0).toLocaleString()}</td>
                  <td style={{ padding: "10px" }}>{(f.usageStats?.pagesProcessed ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {firms.length === 0 && (
          <p style={{ padding: 16, color: "#666", margin: 0 }}>No firms yet.</p>
        )}
      </section>
    </main>
  );
}
