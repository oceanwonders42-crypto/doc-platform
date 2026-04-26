import Link from "next/link";
import { notFound } from "next/navigation";
import { UpdateFirmForm } from "./UpdateFirmForm";

type FirmDetail = {
  id: string;
  name: string;
  plan: string;
  pageLimitMonthly: number;
  retentionDays: number;
  status: string;
  createdAt: string;
  documentCount: number;
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type UsageRow = {
  yearMonth: string;
  pagesProcessed: number;
  docsProcessed: number;
  updatedAt: string | null;
};

type FeatureOverrideRow = {
  id: string;
  featureKey: string;
  enabled: boolean;
  updatedAt: string;
};

type AdminFirmResponse = {
  ok: boolean;
  firm: FirmDetail;
  users: UserRow[];
  apiKeys: ApiKeyRow[];
  usage: UsageRow;
  featureOverrides?: FeatureOverrideRow[];
  error?: string;
};

async function fetchFirmDetail(firmId: string): Promise<AdminFirmResponse | null> {
  const base = process.env.DOC_API_URL;
  const key = process.env.PLATFORM_ADMIN_API_KEY;
  if (!base || !key) return null;
  const res = await fetch(`${base}/admin/firms/${firmId}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return data as AdminFirmResponse;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statCard(label: string, value: string | number, detail?: string) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, background: "#fff" }}>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 6, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 750, color: "#0f172a" }}>{value}</div>
      {detail ? <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>{detail}</div> : null}
    </div>
  );
}

export default async function AdminFirmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchFirmDetail(id);
  if (!data || !data.ok) notFound();

  const { firm, users, apiKeys, usage } = data;
  const featureOverrides = data.featureOverrides ?? [];
  const featureOverrideMap = Object.fromEntries(
    featureOverrides.map((override) => [override.featureKey, override.enabled])
  );

  return (
    <main style={{ padding: 24, maxWidth: 1120, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/admin/firms" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          Back to firms
        </Link>
        <span style={{ border: "1px solid #cbd5e1", borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 800, color: "#0f172a", background: "#f8fafc" }}>
          Developer controls
        </span>
      </div>

      <div
        style={{
          marginBottom: 24,
          padding: 22,
          borderRadius: 20,
          background: "linear-gradient(135deg, #0f172a, #1e293b 62%, rgba(201, 162, 39, 0.4))",
          color: "#fff",
          boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
        }}
      >
        <h1 style={{ fontSize: 32, lineHeight: 1, fontWeight: 750, margin: 0 }}>{firm.name}</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", margin: "10px 0 0" }}>Firm ID: {firm.id}</p>
        <p style={{ maxWidth: 680, color: "rgba(255,255,255,0.78)", margin: "14px 0 0", lineHeight: 1.6 }}>
          Manage plan, usage limits, and developer-controlled feature visibility without exposing disabled tools to firm users.
        </p>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Firm details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {statCard("Plan", firm.plan)}
          {statCard("Status", firm.status)}
          {statCard("Page limit", firm.pageLimitMonthly, "Monthly")}
          {statCard("Retention", firm.retentionDays, "Days")}
          {statCard("Documents", firm.documentCount)}
          {statCard("Created", formatDate(firm.createdAt))}
        </div>
        <UpdateFirmForm
          firmId={firm.id}
          initialPlan={firm.plan}
          initialPageLimit={firm.pageLimitMonthly}
          initialStatus={firm.status}
          initialFeatureOverrides={featureOverrideMap}
        />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Current feature visibility</h2>
        {featureOverrides.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>No active developer overrides are set for this firm.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {featureOverrides.map((override) => (
              <span
                key={override.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: `1px solid ${override.enabled ? "#86efac" : "#e2e8f0"}`,
                  borderRadius: 999,
                  padding: "7px 10px",
                  background: override.enabled ? "#f0fdf4" : "#f8fafc",
                  color: override.enabled ? "#166534" : "#475569",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {override.featureKey}
                <span style={{ fontSize: 11 }}>{override.enabled ? "visible" : "hidden"}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Current month usage</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {statCard("Year-Month", usage.yearMonth)}
          {statCard("Pages processed", usage.pagesProcessed)}
          {statCard("Docs processed", usage.docsProcessed)}
          {usage.updatedAt ? statCard("Last updated", formatDate(usage.updatedAt)) : null}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Users ({users.length})</h2>
        {users.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>No users.</p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px" }}>Email</th>
                  <th style={{ padding: "12px" }}>Role</th>
                  <th style={{ padding: "12px" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px" }}>{u.email}</td>
                    <td style={{ padding: "12px" }}>{u.role}</td>
                    <td style={{ padding: "12px" }}>{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>API keys ({apiKeys.length})</h2>
        {apiKeys.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>No API keys.</p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "12px" }}>Name</th>
                  <th style={{ padding: "12px" }}>Prefix</th>
                  <th style={{ padding: "12px" }}>Scopes</th>
                  <th style={{ padding: "12px" }}>Last used</th>
                  <th style={{ padding: "12px" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px" }}>{k.name}</td>
                    <td style={{ padding: "12px", fontFamily: "monospace", fontSize: 12 }}>{k.keyPrefix}...</td>
                    <td style={{ padding: "12px" }}>{k.scopes}</td>
                    <td style={{ padding: "12px" }}>{k.lastUsedAt ? formatDate(k.lastUsedAt) : "-"}</td>
                    <td style={{ padding: "12px" }}>{formatDate(k.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
