"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";

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
  ocrDiagnostics?: { ocrConfidence?: number | null } | null;
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

export default function ReviewQueuePage() {
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

  function load() {
    setLoading(true);
    const base = getApiBase();
    fetch(`${base}/me/review-queue?limit=50`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isReviewQueueResponse(res) && res.items) setItems(res.items);
        else setError("Failed to load review queue");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

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

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Review Queue" }]}
        title="Review queue"
        description="Documents needing manual review or routing. Confirm route, reject, or open to review."
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
                <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500, color: "var(--onyx-text)" }}>No documents in review</p>
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  When documents need manual routing or review, they’ll appear here.
                </p>
                <Link href="/dashboard/documents" className="onyx-btn-primary" style={{ display: "inline-block", marginTop: "1rem", textDecoration: "none" }}>
                  View documents
                </Link>
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
