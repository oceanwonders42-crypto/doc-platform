"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";

type CaseItem = {
  id: string;
  title: string;
  caseNumber: string | null;
  clientName: string | null;
  createdAt: string;
};

type CasesListResponse = { ok?: boolean; items?: CaseItem[] };

function isCasesListResponse(res: unknown): res is CasesListResponse {
  return typeof res === "object" && res !== null;
}

export default function DemandsPage() {
  const [items, setItems] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const base = getApiBase();
    fetch(`${base}/cases`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isCasesListResponse(res) && res.ok && res.items) setItems(res.items);
        else setError("Failed to load cases");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = search.trim()
    ? items.filter(
        (c) =>
          (c.clientName?.toLowerCase().includes(search.toLowerCase()) ||
            c.caseNumber?.toLowerCase().includes(search.toLowerCase()) ||
            c.title?.toLowerCase().includes(search.toLowerCase()))
      )
    : items;

  const columns: Column<CaseItem>[] = [
    {
      key: "client",
      header: "Client",
      render: (row) => (
        <Link href={`/dashboard/cases/${row.id}?tab=medical-bills`} className="onyx-link" style={{ fontWeight: 500 }}>
          {row.clientName || row.title || "—"}
        </Link>
      ),
    },
    {
      key: "caseNumber",
      header: "Case #",
      render: (row) => row.caseNumber ?? "—",
    },
    {
      key: "title",
      header: "Title",
      render: (row) => <span style={{ color: "var(--onyx-text-muted)" }}>{row.title || "—"}</span>,
    },
    {
      key: "created",
      header: "Created",
      render: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      key: "action",
      header: "",
      render: (row) => (
        <Link href={`/dashboard/cases/${row.id}?tab=medical-bills`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
          View bills & demands
        </Link>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Demands" }]}
        title="Demands"
        description="Medical bills, specials, and demand packages. Open a case to view or draft demand sections."
        action={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="search"
              placeholder="Search by client or case #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 220 }}
            />
          </div>
        }
      />

      {error && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="onyx-link"
            style={{ marginTop: "0.5rem", fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading…</p>
      ) : (
        <div className="onyx-card" style={{ overflow: "hidden" }}>
          <DataTable
            columns={columns}
            data={filtered}
            emptyMessage={
              items.length === 0
                ? "No cases yet. Create cases and add medical records to build demands."
                : "No cases match your search."
            }
          />
        </div>
      )}
    </div>
  );
}
