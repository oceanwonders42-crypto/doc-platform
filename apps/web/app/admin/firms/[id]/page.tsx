"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
import { FeatureOverridesPanel } from "./FeatureOverridesPanel";

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

type EffectiveFeatureAccessSource =
  | "plan"
  | "override"
  | "none"
  | "entitlement"
  | "legacy_flag";

type AdminFirmResponse = {
  ok: boolean;
  firm: FirmDetail;
  users: UserRow[];
  apiKeys: ApiKeyRow[];
  usage: UsageRow;
  featureKeys: string[];
  effectiveFeatureAccess: Array<{
    featureKey: string;
    effectiveEnabled: boolean;
    source: EffectiveFeatureAccessSource;
    planEnabled: boolean;
    overrideId: string | null;
    overrideEnabled: boolean | null;
    startsAt: string | null;
    endsAt: string | null;
    activeNow: boolean;
    reason: string | null;
    createdBy: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  featureOverrides: Array<{
    id: string;
    featureKey: string;
    enabled: boolean;
    isActive: boolean;
    startsAt: string | null;
    endsAt: string | null;
    reason: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  error?: string;
};

type AuthMeResponse = {
  ok?: boolean;
  role?: string;
  isPlatformAdmin?: boolean;
  user?: { role?: string };
};

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

function isPlatformAdminAuth(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as AuthMeResponse;
  return (
    record.isPlatformAdmin === true ||
    record.role === "PLATFORM_ADMIN" ||
    record.user?.role === "PLATFORM_ADMIN"
  );
}

function isAdminFirmResponse(data: unknown): data is AdminFirmResponse {
  return typeof data === "object" && data !== null && "ok" in data;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AdminFirmDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string | string[] }>();
  const firmId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  }, [params]);

  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminFirmResponse | null>(null);
  const [plan, setPlan] = useState("");
  const [pageLimitMonthly, setPageLimitMonthly] = useState("");
  const [status, setStatus] = useState("active");
  const [savingFirm, setSavingFirm] = useState(false);
  const [firmMessage, setFirmMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const loadFirmDetail = useCallback(async () => {
    const authHeader = getAuthHeader();
    if (!authHeader.Authorization) {
      setAuthorized(false);
      setAuthChecked(true);
      setLoading(false);
      router.replace("/login");
      return;
    }

    const base = getApiBase();
    if (!base) {
      setError("API URL is not configured.");
      setAuthChecked(true);
      setAuthorized(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const authResponse = await fetch(`${base}/auth/me`, {
        headers: authHeader,
        ...getFetchOptions(),
      });

      if (authResponse.status === 401) {
        setAuthorized(false);
        setAuthChecked(true);
        setLoading(false);
        router.replace("/login");
        return;
      }

      const authData = await parseJsonResponse(authResponse);
      const isPlatformAdmin = authResponse.ok && isPlatformAdminAuth(authData);
      setAuthChecked(true);
      setAuthorized(isPlatformAdmin);

      if (!isPlatformAdmin) {
        setLoading(false);
        router.replace("/dashboard");
        return;
      }

      const response = await fetch(`/api/admin/firms/${firmId}`, {
        headers: authHeader,
        ...getFetchOptions(),
        cache: "no-store",
      });
      const responseData = await parseJsonResponse(response);

      if (!response.ok || !isAdminFirmResponse(responseData) || !responseData.ok) {
        if (response.status === 404) {
          router.replace("/admin/firms");
          return;
        }
        setError(
          isAdminFirmResponse(responseData)
            ? (responseData.error ?? `HTTP ${response.status}`)
            : `HTTP ${response.status}`
        );
        setLoading(false);
        return;
      }

      setData(responseData);
      setPlan(responseData.firm.plan);
      setPageLimitMonthly(String(responseData.firm.pageLimitMonthly));
      setStatus(responseData.firm.status);
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, "Failed to load admin firm details."));
    } finally {
      setLoading(false);
    }
  }, [firmId, router]);

  useEffect(() => {
    if (!firmId) {
      setError("Missing firm id.");
      setAuthChecked(true);
      setAuthorized(false);
      setLoading(false);
      return;
    }
    void loadFirmDetail();
  }, [firmId, loadFirmDetail]);

  async function handleUpdateFirm(event: React.FormEvent) {
    event.preventDefault();
    setSavingFirm(true);
    setFirmMessage(null);
    try {
      const response = await fetch(`/api/admin/firms/${firmId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        ...getFetchOptions(),
        body: JSON.stringify({
          plan: plan.trim(),
          pageLimitMonthly: parseInt(pageLimitMonthly, 10) || 0,
          status: status.trim(),
        }),
      });
      const responseData = await parseJsonResponse(response);
      if (!response.ok) {
        const message =
          responseData && typeof responseData === "object" && "error" in responseData
            ? String(
                (responseData as { error?: unknown }).error ?? `HTTP ${response.status}`
              )
            : `HTTP ${response.status}`;
        setFirmMessage({ ok: false, text: message });
        return;
      }
      setFirmMessage({ ok: true, text: "Updated." });
      await loadFirmDetail();
    } catch (updateError) {
      setFirmMessage({
        ok: false,
        text: getErrorMessage(updateError, "Failed to update firm."),
      });
    } finally {
      setSavingFirm(false);
    }
  }

  if (!authChecked || loading) {
    return (
      <main
        style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}
      >
        <p style={{ color: "#666", margin: 0 }}>Loading firm details...</p>
      </main>
    );
  }

  if (!authorized) {
    return null;
  }

  if (!data || !data.ok) {
    return (
      <main
        style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}
      >
        <Link href="/admin/firms" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          {"<-"} Firms
        </Link>
        <p style={{ color: "#c00", marginTop: 16 }}>{error ?? "Failed to load firm."}</p>
      </main>
    );
  }

  const { firm, users, apiKeys, usage, featureKeys, effectiveFeatureAccess, featureOverrides } =
    data;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/admin/firms" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          {"<-"} Firms
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

        <form
          onSubmit={handleUpdateFirm}
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 12,
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              Plan
            </label>
            <input
              type="text"
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6, width: 120 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              Page limit (monthly)
            </label>
            <input
              type="number"
              min={0}
              value={pageLimitMonthly}
              onChange={(event) => setPageLimitMonthly(event.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6, width: 100 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              Status
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6, minWidth: 100 }}
            >
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={savingFirm}
            style={{
              padding: "8px 16px",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: savingFirm ? "not-allowed" : "pointer",
              opacity: savingFirm ? 0.6 : 1,
            }}
          >
            {savingFirm ? "Saving..." : "Update firm"}
          </button>
          {firmMessage && (
            <span style={{ color: firmMessage.ok ? "#2e7d32" : "#c00", fontSize: 14 }}>
              {firmMessage.text}
            </span>
          )}
        </form>
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
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Feature access overrides</h2>
        <FeatureOverridesPanel
          firmId={firm.id}
          featureKeys={featureKeys}
          effectiveFeatureAccess={effectiveFeatureAccess}
          featureOverrides={featureOverrides}
          onChanged={loadFirmDetail}
        />
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
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px" }}>{user.email}</td>
                    <td style={{ padding: "10px" }}>{user.role}</td>
                    <td style={{ padding: "10px" }}>{formatDate(user.createdAt)}</td>
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
                {apiKeys.map((apiKey) => (
                  <tr key={apiKey.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px" }}>{apiKey.name}</td>
                    <td style={{ padding: "10px", fontFamily: "monospace", fontSize: 12 }}>
                      {apiKey.keyPrefix}...
                    </td>
                    <td style={{ padding: "10px" }}>{apiKey.scopes}</td>
                    <td style={{ padding: "10px" }}>
                      {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : "-"}
                    </td>
                    <td style={{ padding: "10px" }}>{formatDate(apiKey.createdAt)}</td>
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
