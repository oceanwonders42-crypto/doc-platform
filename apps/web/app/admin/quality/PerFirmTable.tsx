"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type FirmRow = {
  firmId: string;
  firmName: string;
  totalDocs: number;
  processedDocs: number;
  autoRouteRate: number;
  unmatchedRate: number;
  duplicateRate: number;
  avgProcessingLatencyMs: number | null;
  failedDocs: number;
  needsReviewDocs: number;
};

type SortKey = keyof FirmRow;
const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: "firmName", label: "Firm" },
  { key: "totalDocs", label: "Total docs" },
  { key: "processedDocs", label: "Processed" },
  { key: "autoRouteRate", label: "Auto-route %" },
  { key: "unmatchedRate", label: "Unmatched %" },
  { key: "duplicateRate", label: "Duplicate %" },
  { key: "avgProcessingLatencyMs", label: "Avg latency" },
  { key: "failedDocs", label: "Failed" },
  { key: "needsReviewDocs", label: "Needs review" },
];

function formatLatency(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default function PerFirmTable({
  rows,
  selectedFirmId,
}: {
  rows: FirmRow[];
  selectedFirmId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sortKey, setSortKey] = useState<SortKey>("totalDocs");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDesc ? -cmp : cmp;
    });
    return arr;
  }, [rows, sortKey, sortDesc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const drillToFirm = (id: string) => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.set("firmId", id);
    router.push(`/admin/quality?${next.toString()}`);
  };

  if (rows.length === 0) {
    return (
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Per-firm breakdown</h2>
        <p style={{ color: "#666", margin: 0 }}>
          {selectedFirmId ? "Showing single firm view. Clear firm filter to see all firms." : "No firms with documents in the selected range."}
        </p>
      </section>
    );
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Per-firm breakdown</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        Click a row to drill into that firm&apos;s quality stats. <Link href="/admin/firms" style={{ color: "#1565c0", textDecoration: "underline" }}>View firms →</Link>
      </p>
      <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f5f5f5", textAlign: "left", borderBottom: "1px solid #eee" }}>
              {SORT_KEYS.map(({ key, label }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  style={{
                    padding: "10px 8px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                  }}
                >
                  {label}
                  {sortKey === key && (sortDesc ? " ↓" : " ↑")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.firmId}
                onClick={() => drillToFirm(r.firmId)}
                style={{
                  borderBottom: "1px solid #f0f0f0",
                  cursor: "pointer",
                  background: selectedFirmId === r.firmId ? "#e3f2fd" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (selectedFirmId !== r.firmId) e.currentTarget.style.background = "#f9f9f9";
                }}
                onMouseLeave={(e) => {
                  if (selectedFirmId !== r.firmId) e.currentTarget.style.background = "transparent";
                }}
              >
                <td style={{ padding: "8px" }}>
                  <span style={{ fontWeight: 600 }}>{r.firmName}</span>
                  <div style={{ fontSize: 11, color: "#888" }}>{r.firmId}</div>
                </td>
                <td style={{ padding: "8px" }}>{r.totalDocs.toLocaleString()}</td>
                <td style={{ padding: "8px" }}>{r.processedDocs.toLocaleString()}</td>
                <td style={{ padding: "8px" }}>{r.autoRouteRate}%</td>
                <td style={{ padding: "8px" }}>{r.unmatchedRate}%</td>
                <td style={{ padding: "8px" }}>{r.duplicateRate}%</td>
                <td style={{ padding: "8px" }}>{formatLatency(r.avgProcessingLatencyMs)}</td>
                <td style={{ padding: "8px", color: r.failedDocs > 0 ? "#b71c1c" : undefined }}>
                  {r.failedDocs.toLocaleString()}
                </td>
                <td style={{ padding: "8px" }}>{r.needsReviewDocs.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
