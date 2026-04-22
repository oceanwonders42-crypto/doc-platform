import Link from "next/link";

type BillingStatusResponse = {
  ok: boolean;
  firm: {
    id: string;
    name: string;
    plan: string;
    pageLimitMonthly: number;
    billingStatus: string;
    trialEndsAt: string | null;
  };
  usage: {
    yearMonth: string;
    pagesProcessed: number;
    docsProcessed: number;
  };
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
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function BillingPage() {
  const data = await apiGet<BillingStatusResponse>("/billing/status");
  const { firm, usage } = data;
  const percent =
    firm.pageLimitMonthly > 0
      ? Math.round((usage.pagesProcessed / firm.pageLimitMonthly) * 100)
      : 0;
  const trialEndFormatted = firm.trialEndsAt
    ? new Date(firm.trialEndsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main style={{ padding: 24, maxWidth: 560, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard" style={{ fontSize: 14, color: "#666", textDecoration: "underline" }}>
          ← Dashboard
        </Link>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Billing</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Firm: <strong>{firm.name}</strong>
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Current plan</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Plan</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{firm.plan}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Status</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{firm.billingStatus}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Page limit (monthly)</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{firm.pageLimitMonthly}</div>
          </div>
          {trialEndFormatted && (
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Trial ends</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{trialEndFormatted}</div>
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Usage — {formatMonth(usage.yearMonth)}
        </h2>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: "#666", fontSize: 14 }}>Pages processed</span>
            <span style={{ fontWeight: 600 }}>
              {usage.pagesProcessed} / {firm.pageLimitMonthly}
            </span>
          </div>
          <div style={{ height: 8, background: "#f1f1f1", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(percent, 100)}%`,
                height: "100%",
                background: percent >= 90 ? "#c00" : "#111",
              }}
            />
          </div>
          <div style={{ color: "#666", fontSize: 12, marginTop: 8 }}>Docs processed: {usage.docsProcessed}</div>
        </div>
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          background: "#fafafa",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Upgrade</h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
          Need more pages or features? Upgrade your plan to unlock higher limits.
        </p>
        <button
          type="button"
          disabled
          style={{
            padding: "10px 20px",
            background: "#ccc",
            color: "#666",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "not-allowed",
          }}
        >
          Upgrade (coming soon)
        </button>
      </section>
    </main>
  );
}
