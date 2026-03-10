"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/contexts/I18nContext";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";

type TrafficItem = {
  id: string;
  defendantName: string | null;
  citationNumber: string | null;
  jurisdictionState: string | null;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  reviewRequired: boolean;
  createdAt: string;
};

type TrafficListResponse = { ok?: boolean; items?: TrafficItem[] };

function isTrafficListResponse(res: unknown): res is TrafficListResponse {
  return typeof res === "object" && res !== null;
}

export default function TrafficListPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<TrafficItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const base = getApiBase();
    fetch(`${base}/traffic`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isTrafficListResponse(res) && res.ok && res.items) setItems(res.items);
        else setError("Failed to load traffic matters");
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
          (c.defendantName?.toLowerCase().includes(search.toLowerCase()) ||
            c.citationNumber?.toLowerCase().includes(search.toLowerCase()) ||
            c.jurisdictionState?.toLowerCase().includes(search.toLowerCase()))
      )
    : items;

  const columns: Column<TrafficItem>[] = [
    {
      key: "defendant",
      header: "Defendant",
      render: (row) => (
        <Link href={`/dashboard/traffic/${row.id}`} className="onyx-link" style={{ fontWeight: 500 }}>
          {row.defendantName ?? "—"}
        </Link>
      ),
    },
    {
      key: "citationNumber",
      header: "Citation #",
      render: (row) => row.citationNumber ?? "—",
    },
    {
      key: "state",
      header: "State",
      render: (row) => row.jurisdictionState ?? "—",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span style={{ color: "var(--onyx-text-muted)" }}>
          {row.reviewRequired ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.15rem 0.4rem",
                  borderRadius: "var(--onyx-radius-sm)",
                  background: "var(--onyx-warning-muted)",
                  color: "var(--onyx-warning)",
                }}
              >
                Review
              </span>
              {row.status}
            </span>
          ) : (
            row.status
          )}
        </span>
      ),
    },
    {
      key: "issueDate",
      header: "Issue date",
      render: (row) => (row.issueDate ? new Date(row.issueDate).toLocaleDateString() : "—"),
    },
    {
      key: "dueDate",
      header: "Due date",
      render: (row) => (row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "—"),
    },
    {
      key: "action",
      header: "",
      render: (row) => (
        <Link href={`/dashboard/traffic/${row.id}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
          View
        </Link>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: t("nav.traffic") }]}
        title={t("nav.traffic")}
        description="Traffic citations and court matters"
        action={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="search"
              placeholder="Search by defendant or citation #"
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
        <p style={{ color: "var(--onyx-text-muted)" }}>{t("common.loading")}</p>
      ) : (
        <div className="onyx-card" style={{ overflow: "hidden" }}>
          <DataTable
            columns={columns}
            data={filtered}
            emptyMessage={items.length === 0 ? "No traffic matters yet. Upload a citation to create one." : "No matters match your search."}
          />
        </div>
      )}
    </div>
  );
}
