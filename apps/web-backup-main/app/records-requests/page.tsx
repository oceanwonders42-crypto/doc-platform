import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "../components/EmptyState";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { PageHeader } from "../components/PageHeader";
import { formatDate } from "../lib/formatTimestamp";

export const metadata: Metadata = { title: "Records Requests" };
export const dynamic = "force-dynamic";

type RecordsRequestItem = {
  id: string;
  caseId: string;
  caseNumber: string | null;
  clientName: string | null;
  caseTitle: string | null;
  providerName: string;
  status: string;
  requestDate: string | null;
  responseDate: string | null;
};

type RecordsRequestsResponse = {
  ok?: boolean;
  items?: RecordsRequestItem[];
};

async function fetchRecordsRequests(): Promise<RecordsRequestItem[]> {
  const base =
    typeof window !== "undefined"
      ? ""
      : process.env.DOC_WEB_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/records-requests`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch records requests: ${res.status}`);
  const data = (await res.json()) as RecordsRequestsResponse;
  return data?.items ?? [];
}

function caseLabel(r: RecordsRequestItem): string {
  return r.caseTitle || r.caseNumber || r.clientName || "Case";
}

const PAGE_SIZE = 25;

export default async function RecordsRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const items = await fetchRecordsRequests();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const paginatedItems = items.slice(start, start + PAGE_SIZE);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 960,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Records Requests" }]} />
      <PageHeader
        title="Records requests"
        description="Medical records requests sent to providers. Track status and follow up on pending requests."
      />

      <div style={{ marginBottom: 12, color: "#666", fontSize: 13 }}>
        {items.length === 0
          ? "No requests"
          : `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, items.length)} of ${items.length} request${items.length !== 1 ? "s" : ""}`}
      </div>

      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div className="table-scroll-wrapper">
          <table className="dashboard-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr
              style={{
                textAlign: "left",
                borderBottom: "1px solid #eee",
                background: "#fafafa",
              }}
            >
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Case</th>
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Provider</th>
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Status</th>
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Request date</th>
              <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Response date</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                <td style={{ padding: "12px 16px" }}>
                  <Link
                    href={`/records-requests/${r.id}`}
                    style={{ fontWeight: 500, color: "#111", textDecoration: "none" }}
                  >
                    {caseLabel(r)}
                  </Link>
                  <span style={{ fontSize: 12, color: "#888", marginLeft: 6 }}>
                    <Link href={`/cases/${r.caseId}`} style={{ color: "#06c", textDecoration: "underline" }}>
                      Case
                    </Link>
                  </span>
                </td>
                <td style={{ padding: "12px 16px" }}>{r.providerName}</td>
                <td style={{ padding: "12px 16px", color: "#444" }}>{r.status}</td>
                <td style={{ padding: "12px 16px", color: "#444" }}>
                  {formatDate(r.requestDate)}
                </td>
                <td style={{ padding: "12px 16px", color: "#444" }}>
                  {formatDate(r.responseDate)}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 0, border: "none", verticalAlign: "top" }}>
                  <div style={{ padding: 24 }}>
                    <EmptyState
                      title="No records requests yet"
                      description="Create records requests from a case page to request medical records from providers. Open a case and use Request Records to get started."
                      action={{ label: "View cases", href: "/cases" }}
                    />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
          {currentPage > 1 && (
            <Link
              href={`/records-requests?page=${currentPage - 1}`}
              style={{ color: "#111", textDecoration: "underline" }}
            >
              ← Previous
            </Link>
          )}
          <span style={{ color: "#666" }}>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link
              href={`/records-requests?page=${currentPage + 1}`}
              style={{ color: "#111", textDecoration: "underline" }}
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
