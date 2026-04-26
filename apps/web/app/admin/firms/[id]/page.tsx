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

export default async function AdminFirmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchFirmDetail(id);
  if (!data || !data.ok) notFound();

  const { firm, users, apiKeys, usage } = data;
  const featureOverrideMap = Object.fromEntries(
    (data.featureOverrides ?? []).map((override) => [override.featureKey, override.enabled])
  );

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/admin/firms" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Firms
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{firm.name}</h1>
      </div>
      <p style={{ fontSize: 12, color: "#888", marginBottom: 24 }}>ID: {firm.id}</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Firm details</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Plan</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{firm.plan}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Status</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{firm.status}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Page limit (monthly)</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{firm.pageLimitMonthly}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Retention (days)</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{firm.retentionDays}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Documents</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{firm.documentCount}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Created</div>
            <div style={{ fontSize: 14 }}>{formatDate(firm.createdAt)}</div>
          </div>
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
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Current month usage</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Year-Month</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{usage.yearMonth}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Pages processed</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{usage.pagesProcessed}</div>
          </div>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
            <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Docs processed</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{usage.docsProcessed}</div>
          </div>
          {usage.updatedAt && (
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Last updated</div>
              <div style={{ fontSize: 13 }}>{formatDate(usage.updatedAt)}</div>
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Users ({users.length})</h2>
        {users.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>No users.</p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f9f9f9", textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "10px" }}>Email</th>
                  <th style={{ padding: "10px" }}>Role</th>
                  <th style={{ padding: "10px" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px" }}>{u.email}</td>
                    <td style={{ padding: "10px" }}>{u.role}</td>
                    <td style={{ padding: "10px" }}>{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>API keys ({apiKeys.length})</h2>
        {apiKeys.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>No API keys.</p>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f9f9f9", textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "10px" }}>Name</th>
                  <th style={{ padding: "10px" }}>Prefix</th>
                  <th style={{ padding: "10px" }}>Scopes</th>
                  <th style={{ padding: "10px" }}>Last used</th>
                  <th style={{ padding: "10px" }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px" }}>{k.name}</td>
                    <td style={{ padding: "10px", fontFamily: "monospace", fontSize: 12 }}>{k.keyPrefix}...</td>
                    <td style={{ padding: "10px" }}>{k.scopes}</td>
                    <td style={{ padding: "10px" }}>{k.lastUsedAt ? formatDate(k.lastUsedAt) : "—"}</td>
                    <td style={{ padding: "10px" }}>{formatDate(k.createdAt)}</td>
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
