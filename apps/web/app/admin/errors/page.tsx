"use client";

import { useEffect, useState } from "react";
import { getApiBase, getAuthHeader, parseJsonResponse } from "@/lib/api";

type ErrorLog = {
  id: string;
  service: string;
  message: string;
  firmId: string | null;
  userId: string | null;
  area: string | null;
  route: string | null;
  method: string | null;
  severity: string | null;
  status: string | null;
  createdAt: string;
};

export default function AdminErrorsPage() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (serviceFilter.trim()) params.set("service", serviceFilter.trim());
    if (severityFilter) params.set("severity", severityFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (areaFilter) params.set("area", areaFilter);
    fetch(`${getApiBase()}/admin/errors?${params}`, { headers: getAuthHeader() })
      .then(parseJsonResponse)
      .then((data) => {
        const d = data as { ok?: boolean; errors?: ErrorLog[]; error?: string };
        if (d.ok && Array.isArray(d.errors)) setErrors(d.errors);
        else setError(d.error || "Failed to load");
      })
      .catch((e) => setError(e?.message || "Request failed"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [serviceFilter, severityFilter, statusFilter, areaFilter]);

  async function markResolved(id: string) {
    const result = await fetch(`${getApiBase()}/admin/errors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify({ status: "RESOLVED" }),
    });
    try {
      const data = await parseJsonResponse(result) as { ok?: boolean };
      if (result.ok && data.ok) load();
    } catch {
      // ignore parse error
    }
  }

  if (error) return <p style={{ color: "#b91c1c" }}>Error: {error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>System errors</h1>
      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Service"
          value={serviceFilter}
          onChange={(e) => setServiceFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4 }}
        />
        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4 }}
        >
          <option value="">All areas</option>
          <option value="ocr">OCR / pipeline</option>
          <option value="classification">Classification</option>
          <option value="routing">Routing</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4 }}
        >
          <option value="">All severities</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 4 }}
        >
          <option value="">All statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
          <option value="RESOLVED">RESOLVED</option>
        </select>
        <button type="button" onClick={load} disabled={loading} style={{ padding: "0.25rem 0.75rem", background: "#2563eb", color: "white", border: "none", borderRadius: 4 }}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Time</th>
              <th style={{ padding: "0.5rem" }}>Service</th>
              <th style={{ padding: "0.5rem" }}>Severity</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>Message</th>
              <th style={{ padding: "0.5rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {errors.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "0.5rem", whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString()}</td>
                <td style={{ padding: "0.5rem" }}>{e.service}</td>
                <td style={{ padding: "0.5rem" }}>{e.severity ?? "—"}</td>
                <td style={{ padding: "0.5rem" }}>{e.status ?? "—"}</td>
                <td style={{ padding: "0.5rem", maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }} title={e.message}>{e.message}</td>
                <td style={{ padding: "0.5rem" }}>
                  {e.status !== "RESOLVED" && (
                    <button type="button" onClick={() => markResolved(e.id)} style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#059669", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>Mark resolved</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errors.length === 0 && !loading && <p style={{ marginTop: "1rem", color: "#6b7280" }}>No errors found.</p>}
    </div>
  );
}
