"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";

type AuditEvent = {
  id: string;
  documentId: string;
  actor: string;
  action: string;
  fromCaseId: string | null;
  toCaseId: string | null;
  metaJson: unknown;
  createdAt: string;
};

type ClioHandoffAuditEvent = {
  id: string;
  createdAt: string;
  outcomeType:
    | "replay_success"
    | "replay_rejected_legacy"
    | "replay_rejected_data_changed"
    | "forced_reexport"
    | "unknown";
  batchId: string | null;
  handoffExportId: string | null;
  hasIdempotencyKey: boolean;
  reason: string | null;
};

type AuditEventsResponse = { ok?: boolean; items?: AuditEvent[] };
type ClioHandoffAuditEventsResponse = { ok?: boolean; items?: ClioHandoffAuditEvent[] };

function isAuditEventsResponse(res: unknown): res is AuditEventsResponse {
  return typeof res === "object" && res !== null;
}

function isClioHandoffAuditEventsResponse(res: unknown): res is ClioHandoffAuditEventsResponse {
  return typeof res === "object" && res !== null;
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [clioAuditItems, setClioAuditItems] = useState<ClioHandoffAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [clioLoading, setClioLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clioError, setClioError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    const base = getApiBase();
    const headers = getAuthHeader();
    Promise.all([
      fetch(`${base}/me/audit-events?limit=${limit}`, { headers, ...getFetchOptions() })
        .then(parseJsonResponse)
        .then((res: unknown) => {
          if (isAuditEventsResponse(res) && res.ok && res.items) setItems(res.items);
          else setError("Failed to load audit events");
        })
        .catch((e) => setError(e?.message ?? "Failed to load audit events")),
      fetch(`${base}/me/clio-handoff-audit?limit=${limit}`, { headers, ...getFetchOptions() })
        .then(parseJsonResponse)
        .then((res: unknown) => {
          if (isClioHandoffAuditEventsResponse(res) && res.ok && res.items) setClioAuditItems(res.items);
          else setClioError("Failed to load Clio handoff audit events");
        })
        .catch((e) => setClioError(e?.message ?? "Failed to load Clio handoff audit events")),
    ])
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setClioLoading(false);
      });
  }, [limit]);

  const columns: Column<AuditEvent>[] = [
    {
      key: "createdAt",
      header: "Time",
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", fontSize: "0.875rem" }}>
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
    { key: "actor", header: "Actor", render: (row) => row.actor || "—" },
    { key: "action", header: "Action", render: (row) => <span className="onyx-badge onyx-badge-neutral">{row.action}</span> },
    {
      key: "document",
      header: "Document",
      render: (row) => (
        <Link href={`/dashboard/documents/${row.documentId}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
          {row.documentId.slice(0, 12)}…
        </Link>
      ),
    },
    {
      key: "case",
      header: "Case",
      render: (row) => {
        const caseId = row.toCaseId ?? row.fromCaseId;
        return caseId ? (
          <Link href={`/dashboard/cases/${caseId}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
            View
          </Link>
        ) : (
          "—"
        );
      },
    },
  ];

  const clioColumns: Column<ClioHandoffAuditEvent>[] = [
    {
      key: "createdAt",
      header: "Time",
      render: (row) => (
        <span style={{ whiteSpace: "nowrap", fontSize: "0.875rem" }}>
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "outcomeType",
      header: "Outcome",
      render: (row) => (
        <span className="onyx-badge onyx-badge-neutral" style={{ textTransform: "none" }}>
          {row.outcomeType}
        </span>
      ),
    },
    {
      key: "batchId",
      header: "Batch",
      render: (row) => (row.batchId ? row.batchId.slice(0, 10) + "…" : "—"),
    },
    {
      key: "handoffExportId",
      header: "Export",
      render: (row) => (row.handoffExportId ? row.handoffExportId.slice(0, 10) + "…" : "—"),
    },
    {
      key: "hasIdempotencyKey",
      header: "Idempotency",
      render: (row) => (row.hasIdempotencyKey ? "Present" : "Absent"),
    },
    {
      key: "reason",
      header: "Reason",
      render: (row) => row.reason ?? "—",
    },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Audit" }]}
        title="Audit log"
        description="Document and case activity for compliance and review"
        action={
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="onyx-input"
            style={{ minWidth: 100 }}
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
          </select>
        }
      />

      {error && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
        </div>
      )}

        {loading ? (
          <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
        ) : items.length === 0 && !error ? (
        <div className="onyx-card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: "28rem" }}>
          <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500, color: "var(--onyx-text)" }}>No audit events yet</p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
            Activity will appear here as you route documents, update cases, and process records.
          </p>
          <Link href="/dashboard/documents" className="onyx-btn-primary" style={{ display: "inline-block", marginTop: "1.25rem", textDecoration: "none" }}>
            View documents
          </Link>
        </div>
        ) : (
          <div className="onyx-card" style={{ overflow: "hidden" }}>
            <DataTable columns={columns} data={items} emptyMessage="No audit events yet." />
          </div>
        )}

        <h2 style={{ margin: "2rem 0 0.75rem", fontSize: "1.25rem", color: "var(--onyx-text)" }}>
          Clio handoff audit
        </h2>
        {clioError && (
          <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
            <p style={{ margin: 0, color: "var(--onyx-error)" }}>{clioError}</p>
          </div>
        )}
        {clioLoading ? (
          <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
        ) : (
          <div className="onyx-card" style={{ overflow: "hidden" }}>
            <DataTable
              columns={clioColumns}
              data={clioAuditItems}
              emptyMessage="No Clio handoff audit events yet."
            />
          </div>
        )}
      </div>
  );
}
