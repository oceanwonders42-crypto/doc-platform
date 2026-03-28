import Link from "next/link";

type UsageApiResponse = {
  ok: boolean;
  firm: {
    id: string;
    name: string;
    plan: string;
    pageLimitMonthly: number;
    retentionDays?: number;
    status: string;
  };
  usage: {
    yearMonth?: string;
    pagesProcessed: number;
    docsProcessed: number;
    insuranceDocsExtracted: number;
    courtDocsExtracted: number;
    narrativeGenerated: number;
    duplicateDetected: number;
    updatedAt?: string | null;
  };
  usageByMonth?: Array<{
    yearMonth: string;
    pagesProcessed: number;
    docsProcessed: number;
    insuranceDocsExtracted: number;
    courtDocsExtracted: number;
    narrativeGenerated: number;
    duplicateDetected: number;
  }>;
};

async function apiGet<T>(path: string): Promise<T> {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) throw new Error("Missing DOC_API_URL or DOC_API_KEY");
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  if (!m) return ym;
  const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default async function UsagePage() {
  const data = await apiGet<UsageApiResponse>("/me/usage?months=12");
  const usage = data.usage;
  const byMonth = data.usageByMonth ?? [];
  const maxPages = Math.max(1, ...byMonth.map((m) => m.pagesProcessed));
  const maxDocs = Math.max(1, ...byMonth.map((m) => m.docsProcessed));

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/dashboard" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Usage &amp; metering</h1>
      </div>

      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Current month and historical usage for plan metering. Firm: <strong>{data.firm.name}</strong> · Plan:{" "}
        <strong>{data.firm.plan}</strong>
        {data.firm.retentionDays != null && (
          <> · Retention: <strong>{data.firm.retentionDays} days</strong></>
        )}
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Plan & limits</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Plan</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{data.firm.plan}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Page limit (monthly)</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{data.firm.pageLimitMonthly}</div>
          </div>
          {data.firm.retentionDays != null && (
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Retention (days)</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{data.firm.retentionDays}</div>
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Current month {usage.yearMonth ? `(${formatMonth(usage.yearMonth)})` : ""}
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Pages processed</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{usage.pagesProcessed}</div>
            {data.firm.pageLimitMonthly > 0 && (
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                Limit: {data.firm.pageLimitMonthly}
              </div>
            )}
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Docs processed</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{usage.docsProcessed}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Insurance extracted</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{usage.insuranceDocsExtracted}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Court extracted</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{usage.courtDocsExtracted}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Narratives generated</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{usage.narrativeGenerated}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Duplicates detected</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{usage.duplicateDetected}</div>
          </div>
        </div>
        {usage.updatedAt && (
          <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Updated: {new Date(usage.updatedAt).toLocaleString()}</p>
        )}
      </section>

      {byMonth.length > 0 && (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Monthly usage (last 12 months)</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Pages processed</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
                {byMonth.map((m) => (
                  <div
                    key={m.yearMonth}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 40,
                        height: Math.max(4, (m.pagesProcessed / maxPages) * 100),
                        background: "#111",
                        borderRadius: 4,
                        alignSelf: "center",
                      }}
                      title={`${m.yearMonth}: ${m.pagesProcessed}`}
                    />
                    <span style={{ fontSize: 11, color: "#666" }}>{formatMonth(m.yearMonth)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", marginBottom: 8 }}>Documents processed</h3>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
                {byMonth.map((m) => (
                  <div
                    key={m.yearMonth}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        maxWidth: 40,
                        height: Math.max(4, (m.docsProcessed / maxDocs) * 100),
                        background: "#2563eb",
                        borderRadius: 4,
                        alignSelf: "center",
                      }}
                      title={`${m.yearMonth}: ${m.docsProcessed}`}
                    />
                    <span style={{ fontSize: 11, color: "#666" }}>{formatMonth(m.yearMonth)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "8px 8px" }}>Month</th>
                <th style={{ padding: "8px 8px" }}>Pages</th>
                <th style={{ padding: "8px 8px" }}>Docs</th>
                <th style={{ padding: "8px 8px" }}>Insurance</th>
                <th style={{ padding: "8px 8px" }}>Court</th>
                <th style={{ padding: "8px 8px" }}>Narratives</th>
                <th style={{ padding: "8px 8px" }}>Duplicates</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((m) => (
                <tr key={m.yearMonth} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: "8px 8px" }}>{formatMonth(m.yearMonth)}</td>
                  <td style={{ padding: "8px 8px" }}>{m.pagesProcessed}</td>
                  <td style={{ padding: "8px 8px" }}>{m.docsProcessed}</td>
                  <td style={{ padding: "8px 8px" }}>{m.insuranceDocsExtracted}</td>
                  <td style={{ padding: "8px 8px" }}>{m.courtDocsExtracted}</td>
                  <td style={{ padding: "8px 8px" }}>{m.narrativeGenerated}</td>
                  <td style={{ padding: "8px 8px" }}>{m.duplicateDetected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
