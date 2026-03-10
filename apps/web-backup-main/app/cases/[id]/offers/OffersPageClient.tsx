"use client";

import { formatDate } from "../../../lib/formatTimestamp";

type Offer = {
  documentId: string;
  originalName: string;
  date: string;
  amount: number;
};

type Props = {
  caseId: string;
  offers: Offer[];
  latest: Offer | null;
};

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export function OffersPageClient({ caseId, offers, latest }: Props) {
  const handleExportPdf = () => {
    window.open(
      `${typeof window !== "undefined" ? window.location.origin : ""}/api/cases/${caseId}/offers/export-pdf`,
      "_blank",
      "noopener"
    );
  };

  return (
    <>
      {latest && (
        <section
          style={{
            marginBottom: 24,
            padding: 16,
            border: "2px solid #1976d2",
            borderRadius: 12,
            background: "#e3f2fd",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1565c0", marginBottom: 4 }}>
            Latest offer
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{fmtUsd(latest.amount)}</div>
          <div style={{ fontSize: 13, color: "#555" }}>
            {formatDate(latest.date)} — {latest.originalName || latest.documentId}
          </div>
          <a
            href={`/documents/${latest.documentId}`}
            style={{ fontSize: 13, marginTop: 8, display: "inline-block", color: "#1565c0", textDecoration: "underline" }}
          >
            View document →
          </a>
        </section>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          All offers
        </h2>
        <button
          type="button"
          onClick={handleExportPdf}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "#fff",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Export PDF
        </button>
      </div>

      {offers.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>No settlement offers recorded for this case.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {offers.map((o) => (
            <li
              key={o.documentId + o.date}
              style={{
                padding: "12px 14px",
                marginBottom: 8,
                border: "1px solid #e5e5e5",
                borderRadius: 8,
                background: "#fafafa",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{fmtUsd(o.amount)}</span>
                  <span style={{ marginLeft: 8, fontSize: 13, color: "#666" }}>
                    {formatDate(o.date)}
                  </span>
                </div>
                <a
                  href={`/documents/${o.documentId}`}
                  style={{ fontSize: 13, color: "#0066cc", textDecoration: "underline" }}
                >
                  {o.originalName || o.documentId.slice(0, 8) + "…"}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
