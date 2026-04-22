"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, parseJsonResponse } from "../../../lib/api";

type AbuseStats = {
  rateLimitHitCount: number;
  suspiciousUploadCount: number;
  authFailureCount: number;
  invalidPayloadCount: number;
  recentAbuseByIp: Array<{
    ip: string;
    route: string;
    eventType: string;
    count: number;
    lastSeenAt: string;
  }>;
};

type Health = {
  rateLimitHitCount?: number;
  suspiciousUploadCount?: number;
  authFailureCount?: number;
  openErrorCount?: number;
  recentErrorCount?: number;
};

export default function AdminSecurityPage() {
  const [abuse, setAbuse] = useState<AbuseStats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${getApiBase()}/admin/security/activity`, { headers: getAuthHeader() }).then(parseJsonResponse),
      fetch(`${getApiBase()}/admin/system/health`, { headers: getAuthHeader() }).then(parseJsonResponse),
    ])
      .then(([activityRes, healthRes]) => {
        const activity = activityRes as { ok?: boolean; abuse?: AbuseStats; error?: string };
        const health = healthRes as { ok?: boolean; health?: Health };
        if (activity.ok && activity.abuse) setAbuse(activity.abuse);
        else setError(activity.error || "Failed to load activity");
        if (health.ok && health.health) setHealth(health.health);
      })
      .catch((e) => setError(e?.message || "Request failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading security dashboard…</p>;
  if (error) return <p style={{ color: "#b91c1c" }}>Error: {error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Security &amp; abuse</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Rate limit hits</div>
          <div style={{ fontWeight: 600 }}>{abuse?.rateLimitHitCount ?? health?.rateLimitHitCount ?? 0}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Suspicious uploads</div>
          <div style={{ fontWeight: 600 }}>{abuse?.suspiciousUploadCount ?? health?.suspiciousUploadCount ?? 0}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Auth failures</div>
          <div style={{ fontWeight: 600 }}>{abuse?.authFailureCount ?? health?.authFailureCount ?? 0}</div>
        </div>
        <div style={{ padding: "1rem", background: "#f3f4f6", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>Invalid payload</div>
          <div style={{ fontWeight: 600 }}>{abuse?.invalidPayloadCount ?? 0}</div>
        </div>
      </div>
      <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.5rem" }}>
        Open system errors: {health?.openErrorCount ?? "—"} | Recent (24h): {health?.recentErrorCount ?? "—"}
      </p>
      <p style={{ marginBottom: "1rem" }}>
        <Link href="/admin/errors" style={{ color: "#2563eb" }}>View system errors</Link>
        {" · "}
        <Link href="/admin/support" style={{ color: "#2563eb" }}>Support dashboard</Link>
      </p>
      <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>Recent abuse by IP (rolling window)</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>IP</th>
              <th style={{ padding: "0.5rem" }}>Route</th>
              <th style={{ padding: "0.5rem" }}>Event</th>
              <th style={{ padding: "0.5rem" }}>Count</th>
              <th style={{ padding: "0.5rem" }}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {(abuse?.recentAbuseByIp ?? []).slice(0, 25).map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>{row.ip}</td>
                <td style={{ padding: "0.5rem" }}>{row.route}</td>
                <td style={{ padding: "0.5rem" }}>{row.eventType}</td>
                <td style={{ padding: "0.5rem" }}>{row.count}</td>
                <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>{new Date(row.lastSeenAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(!abuse?.recentAbuseByIp?.length) && <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>No recent abuse events in the rolling window.</p>}
    </div>
  );
}
