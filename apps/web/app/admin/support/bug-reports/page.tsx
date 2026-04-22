"use client";

import { useEffect, useState } from "react";
import { getApiBase, getAuthHeader, parseJsonResponse } from "@/lib/api";

type BugReport = {
  id: string;
  firmId: string;
  userId: string | null;
  title: string;
  description: string;
  pageUrl: string | null;
  status: string;
  priority: string;
  createdAt: string;
};

export default function AdminBugReportsPage() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [firmIdFilter, setFirmIdFilter] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (firmIdFilter.trim()) params.set("firmId", firmIdFilter.trim());
    fetch(`${getApiBase()}/admin/support/bug-reports?${params}`, { headers: getAuthHeader() })
      .then(parseJsonResponse)
      .then((data) => {
        const d = data as { ok?: boolean; reports?: BugReport[]; error?: string };
        if (d.ok && Array.isArray(d.reports)) setReports(d.reports);
        else setError(d.error || "Failed to load");
      })
      .catch((e) => setError(e?.message || "Request failed"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p style={{ color: "#b91c1c" }}>Error: {error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Bug reports</h1>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Firm ID"
          value={firmIdFilter}
          onChange={(e) => setFirmIdFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4, width: 140 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4 }}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="CLOSED">CLOSED</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4 }}
        >
          <option value="">All priorities</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="URGENT">URGENT</option>
        </select>
        <button type="button" onClick={load} disabled={loading} style={{ padding: "0.25rem 0.75rem", background: "#2563eb", color: "white", border: "none", borderRadius: 4 }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Created</th>
              <th style={{ padding: "0.5rem" }}>Firm</th>
              <th style={{ padding: "0.5rem" }}>Title</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Priority</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleString()}</td>
                <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>{r.firmId.slice(0, 12)}…</td>
                <td style={{ padding: "0.5rem", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }} title={r.title}>{r.title}</td>
                <td style={{ padding: "0.5rem" }}>{r.status}</td>
                <td style={{ padding: "0.5rem" }}>{r.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reports.length === 0 && !loading && <p style={{ marginTop: "1rem", color: "#6b7280" }}>No bug reports.</p>}
    </div>
  );
}
