type UsageResponse = {
  firm: {
    id: string;
    name: string;
    plan: string;
    pageLimitMonthly: number;
    status: string;
  };
  usage: {
    yearMonth: string;
    pagesProcessed: number;
    docsProcessed: number;
    updatedAt?: string;
  };
};

type DocumentsResponse = {
  items: Array<{
    id: string;
    source: string;
    originalName: string;
    mimeType: string;
    pageCount: number;
    status: string;
    spacesKey: string;
    createdAt: string;
    processedAt: string | null;
  }>;
  nextCursor: string | null;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;

  if (!base) throw new Error("Missing DOC_API_URL in apps/web/.env.local");
  if (!key) throw new Error("Missing DOC_API_KEY in apps/web/.env.local");

  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

export default async function DashboardPage() {
  const usage = await apiGet<UsageResponse>("/me/usage");
  const docs = await apiGet<DocumentsResponse>("/me/documents?limit=10");

  const percent =
    usage.firm.pageLimitMonthly > 0
      ? Math.round((usage.usage.pagesProcessed / usage.firm.pageLimitMonthly) * 100)
      : 0;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Doc Platform Dashboard</h1>
      <div style={{ color: "#555", marginBottom: 20 }}>
        Firm: <b>{usage.firm.name}</b> · Plan: <b>{usage.firm.plan}</b> · Status: <b>{usage.firm.status}</b>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 22 }}>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Month</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{usage.usage.yearMonth}</div>
        </div>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Pages processed</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {usage.usage.pagesProcessed} / {usage.firm.pageLimitMonthly} ({percent}%)
          </div>
          <div style={{ height: 8, background: "#f1f1f1", borderRadius: 999, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(percent, 100)}%`, height: "100%", background: "#111" }} />
          </div>
        </div>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#666", fontSize: 12, marginBottom: 6 }}>Docs processed</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{usage.usage.docsProcessed}</div>
          {usage.usage.updatedAt ? (
            <div style={{ color: "#666", fontSize: 12, marginTop: 8 }}>Updated: {fmtDate(usage.usage.updatedAt)}</div>
          ) : null}
        </div>
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Recent documents</h2>
          <div style={{ color: "#666", fontSize: 12 }}>{docs.items.length} shown</div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "10px 8px" }}>Name</th>
                <th style={{ padding: "10px 8px" }}>Status</th>
                <th style={{ padding: "10px 8px" }}>Pages</th>
                <th style={{ padding: "10px 8px" }}>Created</th>
                <th style={{ padding: "10px 8px" }}>Processed</th>
              </tr>
            </thead>
            <tbody>
              {docs.items.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 600 }}>{d.originalName}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {d.source} · {d.mimeType}
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 999,
                        border: "1px solid #ddd",
                        fontSize: 12,
                      }}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{d.pageCount}</td>
                  <td style={{ padding: "10px 8px", color: "#444" }}>{fmtDate(d.createdAt)}</td>
                  <td style={{ padding: "10px 8px", color: "#444" }}>{d.processedAt ? fmtDate(d.processedAt) : "-"}</td>
                </tr>
              ))}
              {docs.items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: "#666" }}>
                    No documents yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
