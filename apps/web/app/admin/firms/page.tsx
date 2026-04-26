import Link from "next/link";

type FirmRow = {
  firmId: string;
  firmName: string;
  status: string;
  billingStatus?: string;
  plan: string;
  pageLimitMonthly: number;
  createdAt: string;
  lastActivityAt?: string | null;
  documentsProcessed?: number;
  activeUsers?: number;
  pendingInvites?: number;
  integrationStatus?: {
    gmail?: string;
    clio?: string;
  };
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

function statusPill(label: string, tone: "green" | "amber" | "slate") {
  const colors = {
    green: { background: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
    amber: { background: "#fffbeb", color: "#b45309", border: "#fde68a" },
    slate: { background: "#f8fafc", color: "#475569", border: "#e2e8f0" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 12,
        fontWeight: 800,
        background: colors.background,
        color: colors.color,
      }}
    >
      {label}
    </span>
  );
}

export default async function AdminFirmsPage() {
  let data: AdminFirmsResponse;
  try {
    data = await fetchAdminFirms();
  } catch (e) {
    return (
      <main style={{ padding: 24, maxWidth: 1180, margin: "0 auto", fontFamily: "ui-sans-serif, system-ui" }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          Back to admin
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Platform firms</h1>
        <p style={{ color: "#c00" }}>{e instanceof Error ? e.message : String(e)}</p>
      </main>
    );
  }

  if (!data.ok || data.error) {
    return (
      <main style={{ padding: 24, maxWidth: 1180, margin: "0 auto", fontFamily: "ui-sans-serif, system-ui" }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          Back to admin
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Platform firms</h1>
        <p style={{ color: "#c00" }}>{data.error ?? "Failed to load firms"}</p>
      </main>
    );
  }

  const firms = data.firms;

  return (
    <main style={{ padding: 24, maxWidth: 1240, margin: "0 auto", fontFamily: "ui-sans-serif, system-ui" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          Back to admin
        </Link>
        <h1 style={{ fontSize: 28, fontWeight: 850, margin: 0 }}>Developer firm controls</h1>
        <Link
          href="/onboarding"
          style={{
            marginLeft: "auto",
            padding: "9px 15px",
            background: "#111827",
            color: "#fff",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          New firm
        </Link>
      </div>
      <p style={{ color: "#64748b", fontSize: 14, marginBottom: 24, maxWidth: 820, lineHeight: 1.6 }}>
        One platform view for plan tier, billing status, account counts, pending invites, feature flags, integration status, usage, and recent activity.
      </p>

      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 18, boxShadow: "0 18px 40px rgba(15,23,42,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, background: "#fff" }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
              <th style={{ padding: "13px 12px" }}>Firm</th>
              <th style={{ padding: "13px 12px" }}>Status</th>
              <th style={{ padding: "13px 12px" }}>Plan</th>
              <th style={{ padding: "13px 12px" }}>Accounts</th>
              <th style={{ padding: "13px 12px" }}>Integrations</th>
              <th style={{ padding: "13px 12px" }}>Usage</th>
              <th style={{ padding: "13px 12px" }}>Last activity</th>
              <th style={{ padding: "13px 12px" }}></th>
            </tr>
          </thead>
          <tbody>
            {firms.map((firm) => (
              <tr key={firm.firmId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "12px" }}>
                  <span style={{ fontWeight: 800 }}>{firm.firmName}</span>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{firm.firmId}</div>
                </td>
                <td style={{ padding: "12px" }}>
                  {statusPill(firm.status, firm.status === "active" ? "green" : "amber")}
                </td>
                <td style={{ padding: "12px" }}>
                  <div style={{ fontWeight: 800 }}>{firm.plan}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{firm.billingStatus ?? "unknown"}</div>
                </td>
                <td style={{ padding: "12px" }}>
                  <div>{firm.activeUsers ?? 0} active</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{firm.pendingInvites ?? 0} pending</div>
                </td>
                <td style={{ padding: "12px" }}>
                  <div>{statusPill(`Gmail ${firm.integrationStatus?.gmail ?? "DISCONNECTED"}`, firm.integrationStatus?.gmail === "CONNECTED" ? "green" : "slate")}</div>
                  <div style={{ marginTop: 4 }}>{statusPill(`Clio ${firm.integrationStatus?.clio ?? "DISCONNECTED"}`, firm.integrationStatus?.clio === "CONNECTED" ? "green" : "slate")}</div>
                </td>
                <td style={{ padding: "12px" }}>
                  <div>{(firm.usageStats?.documentsProcessed ?? firm.documentsProcessed ?? 0).toLocaleString()} docs</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{(firm.usageStats?.pagesProcessed ?? 0).toLocaleString()} pages</div>
                </td>
                <td style={{ padding: "12px" }}>
                  {firm.lastActivityAt ? formatDate(firm.lastActivityAt) : formatDate(firm.createdAt)}
                </td>
                <td style={{ padding: "12px" }}>
                  <Link
                    href={`/admin/firms/${firm.firmId}`}
                    style={{ fontSize: 13, color: "#0f766e", textDecoration: "underline", fontWeight: 800 }}
                  >
                    View controls
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {firms.length === 0 ? (
        <p style={{ padding: 16, color: "#666", margin: 0 }}>No firms yet.</p>
      ) : null}
    </main>
  );
}
