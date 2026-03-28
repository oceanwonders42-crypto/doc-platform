"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

const SLA_ORANGE_HOURS = 24;
const SLA_RED_HOURS = 72;

const PROCESSING_STAGES: { value: string; label: string }[] = [
  { value: "uploaded", label: "Uploaded" },
  { value: "ocr", label: "OCR" },
  { value: "classification", label: "Classification" },
  { value: "extraction", label: "Extracting" },
  { value: "case_match", label: "Matching" },
  { value: "complete", label: "Complete" },
];

function ProcessingStageIndicator({ stage }: { stage?: string | null }) {
  const current = stage && PROCESSING_STAGES.some((s) => s.value === stage) ? stage : "uploaded";
  const idx = PROCESSING_STAGES.findIndex((s) => s.value === current);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap", fontSize: 12 }}>
      {PROCESSING_STAGES.map((s, i) => (
        <span key={s.value} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              fontWeight: i <= idx ? 600 : 400,
              color: i < idx ? "#666" : i === idx ? "#111" : "#bbb",
            }}
          >
            {s.label}
          </span>
          {i < PROCESSING_STAGES.length - 1 && (
            <span style={{ color: "#ccc", userSelect: "none" }}>→</span>
          )}
        </span>
      ))}
    </span>
  );
}

export type DocumentTableItem = {
  id: string;
  source: string;
  originalName: string;
  mimeType: string;
  pageCount: number;
  status: string;
  spacesKey: string;
  createdAt: string;
  processedAt: string | null;
  routingStatus?: string | null;
  lastAuditAction?: string | null;
  duplicateMatchCount?: number;
  /** When set, this document is a duplicate of another; link to original */
  duplicateOfId?: string | null;
  /** When present and settlementOffer is set, show "Offer: $X" badge */
  insuranceFields?: { settlementOffer?: number | null } | null;
  processingStage?: string | null;
};

type StatusFilter = "all" | "stuck";
type OfferFilter = "all" | "has_offer";

function hasOffer(doc: DocumentTableItem): boolean {
  return doc.insuranceFields?.settlementOffer != null && Number.isFinite(doc.insuranceFields.settlementOffer);
}

function ageHours(createdAt: string): number | null {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (60 * 60 * 1000);
}

function formatAge(createdAt: string): string {
  const h = ageHours(createdAt);
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function isStuck(doc: DocumentTableItem): boolean {
  const h = ageHours(doc.createdAt);
  if (h == null || h <= SLA_ORANGE_HOURS) return false;
  return doc.status !== "UPLOADED";
}

function rowHighlightStyle(createdAt: string): { background?: string } {
  const h = ageHours(createdAt);
  if (h == null || h < SLA_ORANGE_HOURS) return {};
  if (h >= SLA_RED_HOURS) return { background: "rgba(180,0,0,0.12)" };
  return { background: "rgba(230,140,0,0.15)" };
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type Props = { items: DocumentTableItem[] };

export default function DocumentTable({ items }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [offerFilter, setOfferFilter] = useState<OfferFilter>("all");

  const filtered = useMemo(() => {
    let list = statusFilter === "all" ? items : items.filter(isStuck);
    if (offerFilter === "has_offer") list = list.filter(hasOffer);
    return list;
  }, [items, statusFilter, offerFilter]);

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        >
          <option value="all">All</option>
          <option value="stuck">Stuck (&gt;24h, not uploaded)</option>
        </select>
        <select
          value={offerFilter}
          onChange={(e) => setOfferFilter(e.target.value as OfferFilter)}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        >
          <option value="all">All</option>
          <option value="has_offer">Has Offer</option>
        </select>
        <span style={{ fontSize: 14, color: "#666" }}>
          Showing {filtered.length} of {items.length}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "10px 8px" }}>Name</th>
              <th style={{ padding: "10px 8px" }}>Age</th>
              <th style={{ padding: "10px 8px" }}>Status</th>
              <th style={{ padding: "10px 8px" }}>Pages</th>
              <th style={{ padding: "10px 8px" }}>Created</th>
              <th style={{ padding: "10px 8px" }}>Processed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const highlight = rowHighlightStyle(d.createdAt);
              return (
                <tr key={d.id} style={{ borderBottom: "1px solid #f3f3f3", ...highlight }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        href={`/documents/${d.id}`}
                        style={{ fontWeight: 600, color: "inherit", textDecoration: "underline" }}
                      >
                        {d.originalName}
                      </Link>
                      {d.insuranceFields?.settlementOffer != null && Number.isFinite(d.insuranceFields.settlementOffer) && (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: "#e3f2fd",
                            color: "#1565c0",
                          }}
                          title="Settlement offer detected"
                        >
                          Offer: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(d.insuranceFields.settlementOffer)}
                        </span>
                      )}
                      {(d.duplicateOfId || (d.duplicateMatchCount ?? 0) > 0) && (
                        d.duplicateOfId ? (
                          <Link
                            href={`/documents/${d.duplicateOfId}`}
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: "#e3f2fd",
                              color: "#1565c0",
                              textDecoration: "none",
                            }}
                            title="View original document"
                          >
                            Duplicate
                          </Link>
                        ) : (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              background: "#fff3e0",
                              color: "#e65100",
                            }}
                            title="Same file re-uploaded"
                          >
                            Duplicates ({d.duplicateMatchCount})
                          </span>
                        )
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {d.source} · {d.mimeType}
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>{formatAge(d.createdAt)}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 999,
                        border: "1px solid #ddd",
                        fontSize: 12,
                      }}
                    >
                      {d.status}
                    </span>
                    <div style={{ marginTop: 6 }}>
                      <ProcessingStageIndicator stage={d.processingStage} />
                    </div>
                    {d.routingStatus === "routed" && d.lastAuditAction === "auto_routed" && (
                      <span
                        style={{
                          display: "inline-block",
                          marginLeft: 6,
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: "#e8f5e9",
                          color: "#2e7d32",
                        }}
                      >
                        Auto-routed
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 8px" }}>{d.pageCount}</td>
                  <td style={{ padding: "10px 8px", color: "#444" }}>{fmtDate(d.createdAt)}</td>
                  <td style={{ padding: "10px 8px", color: "#444" }}>
                    {d.processedAt ? fmtDate(d.processedAt) : "-"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "#666" }}>
                  {items.length === 0
                    ? "No documents yet."
                    : offerFilter === "has_offer"
                      ? "No documents with a settlement offer."
                      : "No stuck documents."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
