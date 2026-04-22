"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";

type EmailExtraction = {
  attachmentFileName: string | null;
  from: string | null;
  subject: string | null;
  receivedAt: string | null;
  mailboxId: string | null;
  isFax: boolean;
  extractedClientName: string | null;
};

type EmailAutomationField = {
  value: string;
  confidence: number;
  sources: string[];
};

type EmailAutomation = {
  fields: {
    clientName: EmailAutomationField | null;
    dateOfLoss: EmailAutomationField | null;
    claimNumber: EmailAutomationField | null;
    policyNumber: EmailAutomationField | null;
    insuranceCarrier: EmailAutomationField | null;
  };
  matchSignals?: {
    supportingSignals?: string[];
  } | null;
};

type MatchReasoning = {
  matchReason: string | null;
  unmatchedReason: string | null;
  classificationReason: string | null;
  supportingSignals?: string[];
  matterRoutingReason: string | null;
};

type ClioWriteBack = {
  outcomeType: "replay_success" | "replay_rejected_legacy" | "replay_rejected_data_changed" | "forced_reexport" | "unknown";
  createdAt: string;
  handoffExportId: string | null;
  hasIdempotencyKey: boolean;
  reason: string | null;
  batchId: string | null;
};

type ReviewItem = {
  id: string;
  fileName: string;
  status: string;
  reviewReasons?: string[];
  failureStage?: string | null;
  failureReason?: string | null;
  duplicateOfId?: string | null;
  clientName: string | null;
  caseNumber: string | null;
  suggestedCaseId: string | null;
  routedCaseId: string | null;
  matchConfidence: number | null;
  matchReason: string | null;
  unmatchedReason: string | null;
  docType: string | null;
  docTypeConfidence: number | null;
  classificationReason: string | null;
  classificationSignals: unknown;
  providerName: string | null;
  routingRecommendation: "route" | "reject" | "review_manually";
  createdAt: string;
  migrationBatchId?: string | null;
  ocrDiagnostics?: { ocrConfidence?: number | null } | null;
  emailExtraction?: EmailExtraction | null;
  emailAutomation?: EmailAutomation | null;
  matchReasoning?: MatchReasoning | null;
  clioWriteBack?: ClioWriteBack | null;
};

type ReviewQueueResponse = { items?: ReviewItem[] };

function isReviewQueueResponse(res: unknown): res is ReviewQueueResponse {
  return typeof res === "object" && res !== null;
}

type CaseItem = { id: string; title: string | null; caseNumber: string | null; clientName: string | null };

type CasesListResponse = { ok?: boolean; items?: CaseItem[] };

function isCasesListResponse(res: unknown): res is CasesListResponse {
  return typeof res === "object" && res !== null;
}

function formatReviewValue(value: string | null | undefined): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "-";
}

function formatReviewDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function getSignalList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function clioWriteBackBadgeClass(outcomeType: ClioWriteBack["outcomeType"]): string {
  if (outcomeType === "replay_success") return "onyx-badge-success";
  if (outcomeType === "forced_reexport") return "onyx-badge-warning";
  if (outcomeType === "replay_rejected_legacy" || outcomeType === "replay_rejected_data_changed") {
    return "onyx-badge-error";
  }
  return "onyx-badge-neutral";
}

function clioWriteBackLabel(outcomeType: ClioWriteBack["outcomeType"]): string {
  if (outcomeType === "replay_success") return "Replay success";
  if (outcomeType === "replay_rejected_legacy") return "Replay rejected (legacy)";
  if (outcomeType === "replay_rejected_data_changed") return "Replay rejected (data changed)";
  if (outcomeType === "forced_reexport") return "Forced re-export";
  return "Unknown";
}

export default function ReviewQueuePage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<ReviewItem | null>(null);
  const [drawerDocType, setDrawerDocType] = useState("");
  const [drawerProvider, setDrawerProvider] = useState("");
  const [drawerClientName, setDrawerClientName] = useState("");
  const [drawerCaseNumber, setDrawerCaseNumber] = useState("");
  const [drawerCaseId, setDrawerCaseId] = useState("");
  const [drawerSaving, setDrawerSaving] = useState(false);
  const migrationBatchId = searchParams?.get("migrationBatchId")?.trim() ?? "";
  const focusDocumentId = searchParams?.get("documentId")?.trim() ?? "";
  const batchLabel = searchParams?.get("batchLabel")?.trim() ?? "";
  const returnTo = searchParams?.get("returnTo")?.trim() ?? "";
  const batchContextActive = migrationBatchId.length > 0;
  const batchLabelText = batchLabel || (batchContextActive ? `Batch ${migrationBatchId.slice(-8)}` : "");
  const fallbackReturnHref = batchContextActive ? `/dashboard/migration/${migrationBatchId}` : "/dashboard/migration";
  const returnHref = returnTo || fallbackReturnHref;
  const showAllBatchHref = useMemo(() => {
    if (!batchContextActive) return "/dashboard/review";
    const params = new URLSearchParams();
    params.set("migrationBatchId", migrationBatchId);
    if (batchLabelText) params.set("batchLabel", batchLabelText);
    if (returnTo) params.set("returnTo", returnTo);
    return `/dashboard/review?${params.toString()}`;
  }, [batchContextActive, batchLabelText, migrationBatchId, returnTo]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const base = getApiBase();
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (migrationBatchId) params.set("migrationBatchId", migrationBatchId);
    if (focusDocumentId) params.set("documentId", focusDocumentId);
    fetch(`${base}/me/review-queue?${params.toString()}`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isReviewQueueResponse(res) && res.items) setItems(res.items);
        else setError("Failed to load review queue");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, [focusDocumentId, migrationBatchId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!focusDocumentId || items.length === 0) return;
    const matchingItem = items.find((item) => item.id === focusDocumentId);
    if (matchingItem) {
      setDrawerItem(matchingItem);
    }
  }, [focusDocumentId, items]);

  useEffect(() => {
    if (!drawerItem) return;
    setDrawerDocType(drawerItem.docType ?? "");
    setDrawerProvider(drawerItem.providerName ?? "");
    setDrawerClientName(drawerItem.clientName ?? "");
    setDrawerCaseNumber(drawerItem.caseNumber ?? "");
    setDrawerCaseId(drawerItem.suggestedCaseId ?? drawerItem.routedCaseId ?? "");
    const base = getApiBase();
    if (!base) return;
    fetch(`${base}/cases`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((data: unknown) => {
        if (isCasesListResponse(data) && data.ok && Array.isArray(data.items)) setCases(data.items);
      })
      .catch(() => {});
  }, [drawerItem]);

  async function handleRoute(documentId: string, caseId: string) {
    setActioningId(documentId);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/documents/${documentId}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ caseId }),
        ...getFetchOptions(),
      });
      const data = await parseJsonResponse(res);
      if (res.ok && (data as { ok?: boolean }).ok) {
        load();
        setDrawerItem(null);
      } else setError((data as { error?: string }).error ?? "Route failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(documentId: string) {
    setActioningId(documentId);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/documents/${documentId}/reject`, {
        method: "POST",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = await parseJsonResponse(res);
      if (res.ok && (data as { ok?: boolean }).ok) {
        load();
        setDrawerItem(null);
      } else setError((data as { error?: string }).error ?? "Reject failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActioningId(null);
    }
  }

  async function handleApprove(documentId: string) {
    setActioningId(documentId);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/documents/${documentId}/approve`, {
        method: "POST",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = await parseJsonResponse(res);
      if (res.ok && (data as { ok?: boolean }).ok) {
        load();
        setDrawerItem(null);
      } else setError((data as { error?: string }).error ?? "Approve failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActioningId(null);
    }
  }

  async function handleMarkResolved(documentId: string) {
    setActioningId(documentId);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ routingStatus: "resolved" }),
        ...getFetchOptions(),
      });
      const data = await parseJsonResponse(res);
      if (res.ok && data != null && !(data as { error?: string }).error) {
        load();
        setDrawerItem(null);
      } else setError((data as { error?: string })?.error ?? "Mark resolved failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActioningId(null);
    }
  }

  async function handleReprocess(documentId: string) {
    setActioningId(documentId);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/documents/${documentId}/reprocess`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ mode: "full" }),
        ...getFetchOptions(),
      });
      const data = await parseJsonResponse(res);
      if (res.ok && (data as { ok?: boolean }).ok) {
        load();
        setDrawerItem(null);
      } else setError((data as { error?: string }).error ?? "Reprocess failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActioningId(null);
    }
  }

  async function handleSaveRecognition(documentId: string) {
    setDrawerSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (drawerDocType.trim()) body.docType = drawerDocType.trim();
      if (drawerProvider.trim() !== (drawerItem?.providerName ?? "")) body.providerName = drawerProvider.trim();
      if (drawerClientName.trim() !== (drawerItem?.clientName ?? "")) body.clientName = drawerClientName.trim();
      if (drawerCaseNumber.trim() !== (drawerItem?.caseNumber ?? "")) body.caseNumber = drawerCaseNumber.trim();
      if (Object.keys(body).length === 0) {
        setDrawerSaving(false);
        return;
      }
      const res = await fetch(`${getApiBase()}/documents/${documentId}/recognition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(body),
        ...getFetchOptions(),
      });
      const data = await parseJsonResponse(res);
      if (res.ok && (data as { ok?: boolean }).ok) {
        load();
        if (drawerItem) setDrawerItem({
          ...drawerItem,
          docType: body.docType ?? drawerItem.docType,
          providerName: body.providerName ?? drawerItem.providerName,
          clientName: body.clientName ?? drawerItem.clientName,
          caseNumber: body.caseNumber ?? drawerItem.caseNumber,
        });
      } else setError((data as { error?: string }).error ?? "Save failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setDrawerSaving(false);
    }
  }

  async function handleClearDuplicate(documentId: string) {
    setActioningId(documentId);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ duplicateOfId: null }),
        ...getFetchOptions(),
      });
      await parseJsonResponse(res);
      if (res.ok) {
        load();
        setDrawerItem(null);
      } else setError("Could not clear duplicate flag");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActioningId(null);
    }
  }

  const confidencePct = (c: number | null) => (c != null ? `${Math.round(c * 100)}%` : "—");
  const badgeClass = (rec: string) =>
    rec === "route" ? "onyx-badge-success" : rec === "reject" ? "onyx-badge-error" : "onyx-badge-warning";
  const statusBadgeClass = (status: string) =>
    status === "FAILED" ? "onyx-badge-error" : status === "UNMATCHED" ? "onyx-badge-warning" : "onyx-badge-info";

  const columns: Column<ReviewItem>[] = [
    {
      key: "document",
      header: "Document",
      render: (row) => (
        <Link href={`/dashboard/documents/${row.id}`} className="onyx-link" style={{ fontWeight: 500 }}>
          {row.fileName}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className={statusBadgeClass(row.status ?? "NEEDS_REVIEW")} style={{ textTransform: "uppercase", fontSize: "0.75rem" }}>
          {row.status ?? "NEEDS_REVIEW"}
        </span>
      ),
    },
    {
      key: "reviewReasons",
      header: "Why in review",
      render: (row) => (
        <span style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
          {row.duplicateOfId && (
            <span className="onyx-badge onyx-badge-warning" style={{ fontSize: "0.7rem" }} title="Duplicate document">
              Duplicate
            </span>
          )}
          {(row.reviewReasons ?? []).length === 0 && !row.duplicateOfId
            ? "—"
            : (row.reviewReasons ?? []).slice(0, 3).map((r) => (
                <span key={r} className="onyx-badge onyx-badge-neutral" style={{ fontSize: "0.7rem" }} title={r}>
                  {r.length > 20 ? `${r.slice(0, 18)}…` : r}
                </span>
              ))}
          {(row.reviewReasons ?? []).length > 3 && (
            <span className="onyx-badge onyx-badge-neutral" style={{ fontSize: "0.7rem" }} title={(row.reviewReasons ?? []).join(", ")}>
              +{(row.reviewReasons ?? []).length - 3}
            </span>
          )}
        </span>
      ),
    },
    { key: "docType", header: "Doc type", render: (row) => row.docType ?? "—" },
    { key: "provider", header: "Provider", render: (row) => row.providerName ?? "—" },
    { key: "confidence", header: "Match %", render: (row) => confidencePct(row.matchConfidence) },
    { key: "docTypeConf", header: "Type %", render: (row) => confidencePct(row.docTypeConfidence ?? null) },
    {
      key: "reason",
      header: "Reason",
      render: (row) => (
        <span style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
          {row.matchReason ?? row.unmatchedReason ?? row.classificationReason ?? "—"}
        </span>
      ),
    },
    {
      key: "suggestedCase",
      header: "Suggested case",
      render: (row) => (
        <span style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
          {row.duplicateOfId && (
            <Link href={`/dashboard/documents/${row.duplicateOfId}`} className="onyx-link" style={{ fontSize: "0.8125rem" }} title="View original document">
              Original
            </Link>
          )}
          {row.suggestedCaseId ? (
            <Link href={`/dashboard/cases/${row.suggestedCaseId}`} className="onyx-link">View</Link>
          ) : (
            "—"
          )}
        </span>
      ),
    },
    { key: "recommendation", header: "Action", render: (row) => <span className={badgeClass(row.routingRecommendation)}>{row.routingRecommendation.replace(/_/g, " ")}</span> },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="onyx-link"
            style={{ fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer" }}
            onClick={() => setDrawerItem(row)}
          >
            Review
          </button>
          <Link href={`/dashboard/documents/${row.id}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>Open</Link>
          {row.suggestedCaseId && (
            <button
              type="button"
              className="onyx-btn-primary"
              style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
              disabled={actioningId === row.id}
              onClick={() => handleRoute(row.id, row.suggestedCaseId!)}
            >
              {actioningId === row.id ? "…" : "Confirm route"}
            </button>
          )}
          <button
            type="button"
            className="onyx-btn-secondary"
            style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem" }}
            disabled={actioningId === row.id}
            onClick={() => handleReject(row.id)}
          >
            {actioningId === row.id ? "…" : "Reject"}
          </button>
        </span>
      ),
    },
  ];

  const pageDescription = batchContextActive
    ? focusDocumentId
      ? `Focused review for one blocked document from ${batchLabelText}. Resolve it here, then return to the batch.`
      : `Showing only blocked documents from ${batchLabelText}. Resolve these items to unblock batch export.`
    : "Documents needing manual review or routing. Confirm route, reject, or open to review.";
  const emptyTitle = batchContextActive
    ? focusDocumentId
      ? "This document is no longer in batch review"
      : "No blocked documents remain in this batch"
    : "No documents in review";
  const emptyDescription = batchContextActive
    ? focusDocumentId
      ? "The selected document may already be resolved or no longer needs manual review."
      : "The batch does not currently have any documents in the review workflow."
    : "When documents need manual routing or review, they’ll appear here.";
  const primaryEmptyHref = batchContextActive ? returnHref : "/dashboard/documents";
  const primaryEmptyLabel = batchContextActive ? "Back to batch" : "View documents";

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Review Queue" }]}
        title="Review queue"
        description={pageDescription}
        action={
          batchContextActive ? (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <Link href={returnHref} className="onyx-link">
                Back to batch
              </Link>
              {focusDocumentId ? (
                <Link href={showAllBatchHref} className="onyx-link">
                  Show all batch docs
                </Link>
              ) : (
                <Link href="/dashboard/review" className="onyx-link">
                  Clear batch filter
                </Link>
              )}
            </div>
          ) : undefined
        }
      />

      {batchContextActive && (
        <div
          className="onyx-card"
          style={{ padding: "1rem 1.25rem", marginBottom: "1rem", borderColor: "var(--onyx-accent)" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <p style={{ margin: 0, fontWeight: 600 }}>Batch-scoped review: {batchLabelText}</p>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                Showing only documents from this migration batch that still need manual review, routing, or correction before export.
              </p>
            </div>
            <Link href={returnHref} className="onyx-btn-secondary" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
              Return to batch
            </Link>
          </div>
        </div>
      )}

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
        <>
          <PageHeader breadcrumbs={[{ label: "Review Queue" }]} title="Review queue" description="Loading…" />
          <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading review queue…</p>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {items.length === 0 ? (
              <div className="onyx-card" style={{ padding: "2.5rem", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500, color: "var(--onyx-text)" }}>{emptyTitle}</p>
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  When documents need manual routing or review, they’ll appear here.
                </p>
                {batchContextActive && (
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                    {emptyDescription}
                  </p>
                )}
                <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
                  <Link href={primaryEmptyHref} className="onyx-btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>
                    {primaryEmptyLabel}
                  </Link>
                  {batchContextActive && (
                    <Link href="/dashboard/review" className="onyx-btn-secondary" style={{ display: "inline-block", textDecoration: "none" }}>
                      Open full review queue
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="onyx-card" style={{ overflow: "hidden" }}>
                <DataTable columns={columns} data={items} emptyMessage="No documents match your filters." />
              </div>
            )}
          </div>
          {drawerItem && (
            <div className="onyx-card" style={{ width: 360, padding: "1.25rem", alignSelf: "flex-start", position: "sticky", top: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Correct &amp; route</h3>
                <button type="button" onClick={() => setDrawerItem(null)} className="onyx-link" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem" }}>Close</button>
              </div>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", fontWeight: 500 }}>{drawerItem.fileName}</p>
              {/* Quick actions first */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid var(--onyx-border-subtle)" }}>
                {drawerItem.routedCaseId && (
                  <button type="button" onClick={() => handleApprove(drawerItem!.id)} disabled={actioningId === drawerItem.id} className="onyx-btn-primary" style={{ fontSize: "0.8125rem" }}>
                    {actioningId === drawerItem.id ? "…" : "Approve"}
                  </button>
                )}
                <button type="button" onClick={() => handleReject(drawerItem.id)} disabled={actioningId === drawerItem.id} className="onyx-btn-secondary" style={{ fontSize: "0.8125rem", borderColor: "var(--onyx-error)", color: "var(--onyx-error)" }}>
                  {actioningId === drawerItem.id ? "…" : "Reject"}
                </button>
                <Link href={`/dashboard/documents/${drawerItem.id}`} className="onyx-link" style={{ fontSize: "0.8125rem", alignSelf: "center" }}>Open full page</Link>
                {batchContextActive && (
                  <Link href={returnHref} className="onyx-link" style={{ fontSize: "0.8125rem", alignSelf: "center" }}>
                    Back to batch
                  </Link>
                )}
              </div>
              {drawerItem.duplicateOfId && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <span className="onyx-badge onyx-badge-warning" style={{ marginRight: "0.35rem" }}>Duplicate</span>
                  <Link href={`/dashboard/documents/${drawerItem.duplicateOfId}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>View original</Link>
                </div>
              )}
              {(drawerItem.reviewReasons?.length ?? 0) > 0 && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--onyx-text-muted)", marginRight: "0.25rem" }}>Why in review:</span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                    {drawerItem.reviewReasons!.map((r) => (
                      <span key={r} className="onyx-badge onyx-badge-neutral" style={{ fontSize: "0.7rem" }}>{r}</span>
                    ))}
                  </span>
                </div>
              )}
              {(drawerItem.failureStage ?? drawerItem.failureReason) && (
                <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "var(--onyx-surface-subtle)", borderRadius: "var(--onyx-radius-sm)", fontSize: "0.8125rem" }}>
                  {drawerItem.failureStage && <div><strong>Failed at:</strong> {drawerItem.failureStage}</div>}
                  {drawerItem.failureReason && <div><strong>Reason:</strong> {drawerItem.failureReason}</div>}
                </div>
              )}
              {drawerItem.ocrDiagnostics?.ocrConfidence != null && (
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                  OCR confidence: {confidencePct(drawerItem.ocrDiagnostics!.ocrConfidence!)}
                </p>
              )}
              {drawerItem.emailExtraction && (
                <div
                  style={{
                    marginBottom: "0.75rem",
                    padding: "0.75rem",
                    background: "var(--onyx-surface-subtle)",
                    borderRadius: "var(--onyx-radius-sm)",
                    display: "grid",
                    gap: "0.35rem",
                  }}
                >
                  <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>
                    Email extraction
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                    <strong>Subject:</strong> {formatReviewValue(drawerItem.emailExtraction.subject)}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                    <strong>From:</strong> {formatReviewValue(drawerItem.emailExtraction.from)}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                    <strong>Received:</strong> {formatReviewDateTime(drawerItem.emailExtraction.receivedAt)}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                    <strong>Client from subject:</strong> {formatReviewValue(drawerItem.emailExtraction.extractedClientName)}
                  </p>
                  {drawerItem.emailExtraction.attachmentFileName && (
                    <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                      <strong>Attachment:</strong> {drawerItem.emailExtraction.attachmentFileName}
                    </p>
                  )}
                  {drawerItem.emailExtraction.isFax && (
                    <span className="onyx-badge onyx-badge-warning" style={{ width: "fit-content", fontSize: "0.7rem" }}>
                      Fax-to-email
                    </span>
                  )}
                </div>
              )}
              {drawerItem.emailAutomation && (
                <div
                  style={{
                    marginBottom: "0.75rem",
                    padding: "0.75rem",
                    background: "var(--onyx-surface-subtle)",
                    borderRadius: "var(--onyx-radius-sm)",
                    display: "grid",
                    gap: "0.35rem",
                  }}
                >
                  <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>
                    Structured email signals
                  </p>
                  {drawerItem.emailAutomation.fields.clientName && (
                    <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                      <strong>Client:</strong> {drawerItem.emailAutomation.fields.clientName.value}{" "}
                      <span style={{ color: "var(--onyx-text-muted)" }}>
                        ({Math.round(drawerItem.emailAutomation.fields.clientName.confidence * 100)}%)
                      </span>
                    </p>
                  )}
                  {drawerItem.emailAutomation.fields.dateOfLoss && (
                    <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                      <strong>DOL:</strong> {drawerItem.emailAutomation.fields.dateOfLoss.value}{" "}
                      <span style={{ color: "var(--onyx-text-muted)" }}>
                        ({Math.round(drawerItem.emailAutomation.fields.dateOfLoss.confidence * 100)}%)
                      </span>
                    </p>
                  )}
                  {drawerItem.emailAutomation.fields.claimNumber && (
                    <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                      <strong>Claim #:</strong> {drawerItem.emailAutomation.fields.claimNumber.value}{" "}
                      <span style={{ color: "var(--onyx-text-muted)" }}>
                        ({Math.round(drawerItem.emailAutomation.fields.claimNumber.confidence * 100)}%)
                      </span>
                    </p>
                  )}
                  {drawerItem.emailAutomation.fields.policyNumber && (
                    <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                      <strong>Policy #:</strong> {drawerItem.emailAutomation.fields.policyNumber.value}{" "}
                      <span style={{ color: "var(--onyx-text-muted)" }}>
                        ({Math.round(drawerItem.emailAutomation.fields.policyNumber.confidence * 100)}%)
                      </span>
                    </p>
                  )}
                  {drawerItem.emailAutomation.fields.insuranceCarrier && (
                    <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                      <strong>Carrier:</strong> {drawerItem.emailAutomation.fields.insuranceCarrier.value}{" "}
                      <span style={{ color: "var(--onyx-text-muted)" }}>
                        ({Math.round(drawerItem.emailAutomation.fields.insuranceCarrier.confidence * 100)}%)
                      </span>
                    </p>
                  )}
                  {getSignalList(drawerItem.emailAutomation.matchSignals?.supportingSignals).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.15rem" }}>
                      {getSignalList(drawerItem.emailAutomation.matchSignals?.supportingSignals).map((signal) => (
                        <span key={signal} className="onyx-badge onyx-badge-neutral" style={{ fontSize: "0.7rem" }}>
                          {signal}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(drawerItem.matchReasoning || drawerItem.matchReason || drawerItem.unmatchedReason || drawerItem.classificationReason) && (
                <div
                  style={{
                    marginBottom: "0.75rem",
                    padding: "0.75rem",
                    background: "var(--onyx-surface-subtle)",
                    borderRadius: "var(--onyx-radius-sm)",
                    display: "grid",
                    gap: "0.35rem",
                  }}
                >
                  <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>
                    Match reasoning
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                    <strong>Match:</strong> {formatReviewValue(drawerItem.matchReasoning?.matchReason ?? drawerItem.matchReason)}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                    <strong>Fallback:</strong> {formatReviewValue(drawerItem.matchReasoning?.unmatchedReason ?? drawerItem.unmatchedReason)}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                    <strong>Classification:</strong> {formatReviewValue(drawerItem.matchReasoning?.classificationReason ?? drawerItem.classificationReason)}
                  </p>
                  {drawerItem.matchReasoning?.matterRoutingReason && (
                    <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                      <strong>Matter routing:</strong> {drawerItem.matchReasoning.matterRoutingReason}
                    </p>
                  )}
                  {getSignalList(drawerItem.matchReasoning?.supportingSignals ?? drawerItem.classificationSignals).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.15rem" }}>
                      {getSignalList(drawerItem.matchReasoning?.supportingSignals ?? drawerItem.classificationSignals).map((signal) => (
                        <span key={signal} className="onyx-badge onyx-badge-neutral" style={{ fontSize: "0.7rem" }}>
                          {signal}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(drawerItem.clioWriteBack || drawerItem.migrationBatchId) && (
                <div
                  style={{
                    marginBottom: "0.75rem",
                    padding: "0.75rem",
                    background: "var(--onyx-surface-subtle)",
                    borderRadius: "var(--onyx-radius-sm)",
                    display: "grid",
                    gap: "0.35rem",
                  }}
                >
                  <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>
                    Clio write-back
                  </p>
                  {drawerItem.clioWriteBack ? (
                    <>
                      <span className={`onyx-badge ${clioWriteBackBadgeClass(drawerItem.clioWriteBack.outcomeType)}`} style={{ width: "fit-content", fontSize: "0.7rem" }}>
                        {clioWriteBackLabel(drawerItem.clioWriteBack.outcomeType)}
                      </span>
                      <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                        <strong>Logged:</strong> {formatReviewDateTime(drawerItem.clioWriteBack.createdAt)}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                        <strong>Reason:</strong> {formatReviewValue(drawerItem.clioWriteBack.reason)}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                        <strong>Idempotency key:</strong> {drawerItem.clioWriteBack.hasIdempotencyKey ? "Present" : "Absent"}
                      </p>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                      No Clio write-back result is recorded for this batch yet.
                    </p>
                  )}
                </div>
              )}
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--onyx-text-muted)", marginBottom: "0.25rem" }}>Doc type</label>
                <input
                  type="text"
                  value={drawerDocType}
                  onChange={(e) => setDrawerDocType(e.target.value)}
                  placeholder="e.g. medical_record, insurance_letter"
                  className="onyx-input"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--onyx-text-muted)", marginBottom: "0.25rem" }}>Provider</label>
                <input
                  type="text"
                  value={drawerProvider}
                  onChange={(e) => setDrawerProvider(e.target.value)}
                  placeholder="Provider name"
                  className="onyx-input"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--onyx-text-muted)", marginBottom: "0.25rem" }}>Client name</label>
                <input
                  type="text"
                  value={drawerClientName}
                  onChange={(e) => setDrawerClientName(e.target.value)}
                  placeholder="Client name"
                  className="onyx-input"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: "0.75rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--onyx-text-muted)", marginBottom: "0.25rem" }}>Case number</label>
                <input
                  type="text"
                  value={drawerCaseNumber}
                  onChange={(e) => setDrawerCaseNumber(e.target.value)}
                  placeholder="Case number"
                  className="onyx-input"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "var(--onyx-text-muted)", marginBottom: "0.25rem" }}>Route to case</label>
                <select
                  value={drawerCaseId}
                  onChange={(e) => setDrawerCaseId(e.target.value)}
                  className="onyx-input"
                  style={{ width: "100%" }}
                >
                  <option value="">— Select case —</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>{c.caseNumber ?? c.clientName ?? c.title ?? c.id}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button type="button" onClick={() => handleSaveRecognition(drawerItem.id)} disabled={drawerSaving} className="onyx-btn-secondary" style={{ fontSize: "0.875rem" }}>
                  {drawerSaving ? "Saving…" : "Save corrections"}
                </button>
                {drawerCaseId && (
                  <button type="button" onClick={() => handleRoute(drawerItem.id, drawerCaseId)} disabled={actioningId === drawerItem.id} className="onyx-btn-primary" style={{ fontSize: "0.875rem" }}>
                    {actioningId === drawerItem.id ? "…" : "Route to case"}
                  </button>
                )}
                <button type="button" onClick={() => handleReprocess(drawerItem.id)} disabled={actioningId === drawerItem.id} className="onyx-btn-secondary" style={{ fontSize: "0.875rem" }} title="Re-run full processing (OCR + extraction + classification + matching)">
                  {actioningId === drawerItem.id ? "…" : "Reprocess"}
                </button>
                {drawerItem.duplicateOfId && (
                  <button type="button" onClick={() => handleClearDuplicate(drawerItem.id)} disabled={actioningId === drawerItem.id} className="onyx-btn-secondary" style={{ fontSize: "0.875rem" }} title="Mark as not a duplicate (override)">
                    {actioningId === drawerItem.id ? "…" : "Mark not duplicate"}
                  </button>
                )}
                <button type="button" onClick={() => handleMarkResolved(drawerItem.id)} disabled={actioningId === drawerItem.id} className="onyx-btn-secondary" style={{ fontSize: "0.875rem" }}>
                  {actioningId === drawerItem.id ? "…" : "Mark resolved"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
