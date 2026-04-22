"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, parseJsonResponse } from "@/lib/api";

type Incident = {
  id: string;
  severity: string;
  title: string;
  description: string | null;
  status: string;
  relatedErrorId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

function severityColor(s: string): string {
  switch (s) {
    case "CRITICAL": return "#b91c1c";
    case "HIGH": return "#c2410c";
    case "MEDIUM": return "#b45309";
    case "LOW": return "#15803d";
    default: return "#6b7280";
  }
}

export default function AdminIncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (statusFilter) params.set("status", statusFilter);
    if (severityFilter) params.set("severity", severityFilter);
    fetch(`${getApiBase()}/admin/incidents?${params}`, { headers: getAuthHeader() })
      .then(parseJsonResponse)
      .then((data) => {
        const d = data as { ok?: boolean; incidents?: Incident[]; error?: string };
        if (d.ok && Array.isArray(d.incidents)) setIncidents(d.incidents);
        else setError(d.error || "Failed to load");
      })
      .catch((e) => setError(e?.message || "Request failed"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [statusFilter, severityFilter]);

  async function updateStatus(id: string, status: string) {
    const result = await fetch(`${getApiBase()}/admin/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ status }),
    });
    try {
      const data = await parseJsonResponse(result) as { ok?: boolean };
      if (result.ok && data.ok) load();
    } catch {
      // ignore parse error
    }
  }

  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED");

  if (error) return <p style={{ color: "#b91c1c" }}>Error: {error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Incidents</h1>
      <p style={{ color: "#6b7280", marginBottom: "1rem", fontSize: "0.875rem" }}>
        Track and resolve platform incidents. Open: {openIncidents.length}.
      </p>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4 }}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="MITIGATING">MITIGATING</option>
          <option value="RESOLVED">RESOLVED</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4 }}
        >
          <option value="">All severities</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
        <button type="button" onClick={load} disabled={loading} style={{ padding: "0.25rem 0.75rem", background: "#2563eb", color: "white", border: "none", borderRadius: 4 }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <Link href="/admin/support" style={{ marginLeft: "auto", fontSize: "0.875rem", color: "#2563eb" }}>Back to Support</Link>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Created</th>
              <th style={{ padding: "0.5rem" }}>Severity</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Title</th>
              <th style={{ padding: "0.5rem" }}>Resolution</th>
              <th style={{ padding: "0.5rem" }}>Linked error</th>
              <th style={{ padding: "0.5rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>{new Date(i.createdAt).toLocaleString()}</td>
                <td style={{ padding: "0.5rem" }}>
                  <span style={{ background: severityColor(i.severity), color: "white", padding: "0.15rem 0.4rem", borderRadius: 4, fontSize: "0.75rem" }}>{i.severity}</span>
                </td>
                <td style={{ padding: "0.5rem" }}>{i.status}</td>
                <td style={{ padding: "0.5rem" }}>
                  <strong>{i.title}</strong>
                  {i.description && <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>{i.description.slice(0, 120)}{i.description.length > 120 ? "…" : ""}</div>}
                </td>
                <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>{i.resolvedAt ? new Date(i.resolvedAt).toLocaleString() : "—"}</td>
                <td style={{ padding: "0.5rem" }}>
                  {i.relatedErrorId ? <Link href={`/admin/errors?highlight=${i.relatedErrorId}`} style={{ color: "#2563eb", fontSize: "0.8rem" }}>View error</Link> : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>
                  {i.status !== "RESOLVED" && (
                    <>
                      {i.status !== "MITIGATING" && (
                        <button type="button" onClick={() => updateStatus(i.id, "MITIGATING")} style={{ marginRight: "0.25rem", padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#b45309", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Mitigating</button>
                      )}
                      <button type="button" onClick={() => updateStatus(i.id, "RESOLVED")} style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#059669", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Resolve</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {incidents.length === 0 && !loading && <p style={{ marginTop: "1rem", color: "#6b7280" }}>No incidents found.</p>}
    </div>
  );
}
