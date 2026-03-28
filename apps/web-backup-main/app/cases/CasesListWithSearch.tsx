"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmptyState from "../components/EmptyState";
import { formatTimestamp } from "../lib/formatTimestamp";

type CaseItem = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
  status?: string | null;
  createdAt?: string;
};

type ProviderItem = { id: string; name: string };

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "closed", label: "Closed" },
];

export default function CasesListWithSearch({
  cases,
  providers = [],
  currentProviderId = null,
}: {
  cases: CaseItem[];
  providers?: ProviderItem[];
  currentProviderId?: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    let result = cases;

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          (c.clientName ?? "").toLowerCase().includes(q) ||
          (c.caseNumber ?? "").toLowerCase().includes(q)
      );
    }

    if (statusFilter) {
      result = result.filter(
        (c) => (c.status ?? "open").toLowerCase() === statusFilter.toLowerCase()
      );
    }

    return result;
  }, [cases, search, statusFilter]);

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input
          type="search"
          placeholder="Search by client name or case number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            maxWidth: 360,
            padding: "10px 14px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
          aria-label="Search cases"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "10px 14px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 8,
            minWidth: 140,
          }}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {providers.length > 0 && (
          <select
            value={currentProviderId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              router.push(v ? `/cases?provider=${encodeURIComponent(v)}` : "/cases");
            }}
            style={{
              padding: "10px 14px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 8,
              minWidth: 160,
            }}
            aria-label="Filter by provider"
          >
            <option value="">All providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
        Showing {filtered.length} of {cases.length} case{cases.length !== 1 ? "s" : ""}
      </p>
      {filtered.length === 0 ? (
        <EmptyState
          title={cases.length === 0 ? "No cases yet" : "No cases match your search"}
          description={
            cases.length === 0
              ? "Route documents in the review queue to create cases, or upload documents to get started."
              : "Try adjusting your search or filters to find what you need."
          }
          action={
            cases.length === 0
              ? { label: "Open Review queue", href: "/dashboard/review" }
              : { label: "Clear filters", href: "/cases" }
          }
        />
      ) : (
        <>
          <style>{`
            .case-list-row-link {
              cursor: pointer;
              transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .case-list-row-link:hover {
              background-color: #f0f0f0 !important;
              border-color: #d4d4d4 !important;
              box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            }
          `}</style>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {filtered.map((c) => (
              <li key={c.id} style={{ marginBottom: 8 }}>
                <Link
                  href={`/cases/${c.id}`}
                  className="case-list-row-link"
                  style={{
                    display: "block",
                    padding: "14px 16px",
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    background: "#fafafa",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#111", fontSize: 15 }}>
                    {c.clientName ?? c.caseNumber ?? c.title ?? `Case ${c.id}`}
                  </span>
                  <div style={{ marginTop: 6, fontSize: 13, color: "#666" }}>
                    {[c.caseNumber, c.clientName, c.title].filter(Boolean).join(" · ")}
                  </div>
                  {c.createdAt && (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#888" }}>
                      Created {formatTimestamp(c.createdAt)}
                    </div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 13, color: "#06c" }}>
                    Open case →
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
