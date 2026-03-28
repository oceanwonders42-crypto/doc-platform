"use client";

import Link from "next/link";
import EmptyState from "../components/EmptyState";

type Provider = {
  id: string;
  name: string;
  city: string;
  state: string;
  phone?: string | null;
};

export default function ProvidersTable({
  items,
  totalCount,
  page,
  pageSize,
  totalPages,
  searchQuery,
}: {
  items: Provider[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  searchQuery: string;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <>
      <form method="GET" style={{ marginBottom: 16 }}>
        <input type="hidden" name="page" value="1" />
        <input
          type="text"
          name="q"
          placeholder="Search by name..."
          defaultValue={searchQuery}
          style={{
            width: "100%",
            maxWidth: 280,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          style={{
            marginLeft: 8,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </form>

      <div style={{ marginBottom: 12, color: "#666", fontSize: 13 }}>
        Showing {totalCount === 0 ? 0 : start}–{end} of {totalCount} provider
        {totalCount !== 1 ? "s" : ""}
      </div>

      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid #eee",
                background: "#fafafa",
              }}
            >
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>
                Name
              </th>
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>
                City
              </th>
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>
                State
              </th>
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>
                Phone
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                <td style={{ padding: "12px 16px" }}>
                  <Link
                    href={`/providers/${p.id}`}
                    style={{
                      fontWeight: 600,
                      color: "#111",
                      textDecoration: "none",
                    }}
                  >
                    {p.name}
                  </Link>
                </td>
                <td style={{ padding: "12px 16px", fontSize: 14 }}>{p.city}</td>
                <td style={{ padding: "12px 16px", fontSize: 14 }}>{p.state}</td>
                <td style={{ padding: "12px 16px", fontSize: 14, color: "#444" }}>
                  {p.phone || "—"}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 0, border: "none", verticalAlign: "top" }}>
                  <div style={{ padding: 24 }}>
                    <EmptyState
                      title={totalCount === 0 ? "No providers yet" : "No providers match your search"}
                      description={
                        totalCount === 0
                          ? "Add providers to request medical records and track facilities for your cases."
                          : "Try a different search term or clear your search."
                      }
                      action={
                        totalCount === 0
                          ? { label: "Add provider", href: "/providers/new" }
                          : { label: "Clear search", href: "/providers" }
                      }
                    />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
            fontSize: 14,
          }}
        >
          {page > 1 && (
            <Link
              href={buildPageUrl(searchQuery, page - 1)}
              style={{ color: "#111", textDecoration: "underline" }}
            >
              ← Previous
            </Link>
          )}
          <span style={{ color: "#666" }}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildPageUrl(searchQuery, page + 1)}
              style={{ color: "#111", textDecoration: "underline" }}
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </>
  );
}

function buildPageUrl(q: string, page: number): string {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set("q", q.trim());
  sp.set("page", String(page));
  return `/providers?${sp.toString()}`;
}
