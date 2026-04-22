"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  formatApiClientError,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";

type CaseItem = {
  id: string;
  title: string;
  caseNumber: string | null;
  clientName: string | null;
  createdAt: string;
};

type CasesListResponse = {
  ok?: boolean;
  items?: CaseItem[];
  error?: string;
};

const CASES_REFRESH_INTERVAL_MS = 30_000;

function isCasesListResponse(res: unknown): res is CasesListResponse {
  return typeof res === "object" && res !== null;
}

export default function CasesListPage() {
  const [items, setItems] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const inFlightRef = useRef(false);

  const load = useCallback(async (options?: { background?: boolean }) => {
    if (inFlightRef.current) return;
    const background = options?.background === true;
    inFlightRef.current = true;
    if (!background) {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/cases", {
        headers: { Accept: "application/json", ...getAuthHeader() },
        ...getFetchOptions({ cache: "no-store" }),
      });
      const payload = await parseJsonResponse(response);
      const data = payload as CasesListResponse;
      if (!isCasesListResponse(data) || !data.ok || !Array.isArray(data.items)) {
        throw new Error(data.error || "Failed to load cases.");
      }
      setItems(data.items);
      setError(null);
    } catch (requestError) {
      setError(
        formatApiClientError(requestError, "Failed to load cases.", {
          deploymentMessage:
            "The cases proxy returned HTML instead of JSON. Check the mounted /cases API route and the active web build.",
        })
      );
    } finally {
      inFlightRef.current = false;
      if (!background) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshInBackground = () => {
      void load({ background: true });
    };
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshInBackground();
      }
    }, CASES_REFRESH_INTERVAL_MS);
    const handleFocus = () => refreshInBackground();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshInBackground();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  const filtered = search.trim()
    ? items.filter((item) => {
        const query = search.toLowerCase();
        return (
          item.clientName?.toLowerCase().includes(query)
          || item.caseNumber?.toLowerCase().includes(query)
          || item.title?.toLowerCase().includes(query)
        );
      })
    : items;

  const columns: Column<CaseItem>[] = [
    {
      key: "client",
      header: "Client",
      render: (row) => (
        <Link href={`/dashboard/cases/${row.id}`} className="onyx-link" style={{ fontWeight: 500 }}>
          {row.clientName || row.title || "-"}
        </Link>
      ),
    },
    {
      key: "caseNumber",
      header: "Case #",
      render: (row) => row.caseNumber ?? "-",
    },
    {
      key: "title",
      header: "Title",
      render: (row) => <span style={{ color: "var(--onyx-text-muted)" }}>{row.title || "-"}</span>,
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
        <Link href={`/dashboard/cases/${row.id}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
          View
        </Link>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Cases" }]}
        title="Cases"
        description="Manage personal injury cases."
        action={
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="search"
              placeholder="Search by client or case #"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="onyx-input"
              style={{ minWidth: 220 }}
            />
          </div>
        }
      />

      {error && (
        <div
          className="onyx-card"
          style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}
        >
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="onyx-link"
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading...</p>
      ) : (
        <div className="onyx-card" style={{ overflow: "hidden" }}>
          <DataTable
            columns={columns}
            data={filtered}
            emptyMessage={
              items.length === 0
                ? "No cases yet. Upload documents or create records requests to build your case list."
                : "No cases match your search."
            }
          />
        </div>
      )}
    </div>
  );
}
