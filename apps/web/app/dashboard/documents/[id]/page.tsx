"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DocumentPreview } from "@/components/dashboard/DocumentPreview";

type Doc = {
  id: string;
  originalName: string;
  status: string;
  pageCount: number | null;
  source?: string;
  routedCaseId: string | null;
  routingStatus: string | null;
  createdAt?: string;
  processedAt?: string | null;
  ingestedAt?: string | null;
  lastRunAt?: string | null;
  extractedFields?: Record<string, unknown>;
  duplicateOfId?: string | null;
  duplicateMatchCount?: number;
  errors?: string | null;
  pipelineStage?: string | null;
  metaJson?: Record<string, unknown> | null;
}

type CaseItem = { id: string; title: string | null; caseNumber: string | null; clientName: string | null };

type ExportPreview = {
  ok: boolean;
  needsRouting?: boolean;
  message?: string;
  fileName: string | null;
  folderPath: string | null;
  context?: { caseNumber: string; clientName: string; caseTitle: string; documentType: string; providerName: string; serviceDate: string; originalName: string };
  exportFileNameOverride?: string;
  exportFolderPathOverride?: string;
};

type Recognition = {
  docType: string | null;
  clientName: string | null;
  caseNumber: string | null;
  incidentDate?: string | null;
  confidence: number | null;
  textExcerpt: string | null;
  matchConfidence: number | null;
  matchReason: string | null;
  suggestedCaseId: string | null;
  unmatchedReason: string | null;
  classificationReason: string | null;
  classificationSignals?: unknown;
  facilityName: string | null;
  providerName: string | null;
  insuranceFields?: Record<string, unknown> | null;
  courtFields?: Record<string, unknown> | null;
  extractedJson?: Record<string, unknown> | null;
  ocrEngine?: string | null;
  ocrConfidence?: number | null;
  pageCountDetected?: number | null;
  qualityScore?: number | null;
  issuesJson?: unknown;
}

type BillLine = {
  id: string;
  documentId: string;
  providerName: string | null;
  serviceDate: string | null;
  cptCode: string | null;
  procedureDescription: string | null;
  amountCharged: number | null;
  amountPaid: number | null;
  balance: number | null;
  lineTotal: number | null;
}

type TimelineEvent = {
  id: string;
  eventDate: string | null;
  eventType: string | null;
  track: string | null;
  provider: string | null;
  diagnosis: string | null;
  procedure: string | null;
  amount: string | null;
  documentId: string | null;
  metadataJson: unknown;
}

type DocumentRecognitionResponse = { ok?: boolean; document?: Doc; recognition?: Recognition };

function isDocumentRecognitionResponse(res: unknown): res is DocumentRecognitionResponse {
  return typeof res === "object" && res !== null;
}

function isExportPreviewResponse(res: unknown): res is ExportPreview {
  return typeof res === "object" && res !== null;
}

type CasesListResponse = { ok?: boolean; items?: CaseItem[] };

function isCasesListResponse(res: unknown): res is CasesListResponse {
  return typeof res === "object" && res !== null;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [doc, setDoc] = useState<Doc | null>(null);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [exportPreview, setExportPreview] = useState<ExportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [providerName, setProviderName] = useState("");
  const [docType, setDocType] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [exportFileNameOverride, setExportFileNameOverride] = useState("");
  const [exportFolderPathOverride, setExportFolderPathOverride] = useState("");
  const [clearDuplicateLoading, setClearDuplicateLoading] = useState(false);
  const [reprocessError, setReprocessError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const base = getApiBase();
    const headers = getAuthHeader();
    const opts = getFetchOptions();

    fetch(`${base}/documents/${id}/recognition`, { headers, ...opts })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isDocumentRecognitionResponse(res) && res.ok && res.document) {
          setDoc(res.document);
          setRecognition(res.recognition ?? null);
          const d = res.document;
          setCaseId(d.routedCaseId ?? "");
          setExportFileNameOverride((d.metaJson as Record<string, unknown>)?.exportFileNameOverride != null ? String((d.metaJson as Record<string, unknown>).exportFileNameOverride) : "");
          setExportFolderPathOverride((d.metaJson as Record<string, unknown>)?.exportFolderPathOverride != null ? String((d.metaJson as Record<string, unknown>).exportFolderPathOverride) : "");
          const rec = res.recognition;
          if (rec) {
            setProviderName(rec.providerName ?? "");
            setDocType(rec.docType ?? "");
            setIncidentDate(rec.incidentDate ? (rec.incidentDate as string).slice(0, 10) : "");
          }
        } else setError("Document not found");
        return isDocumentRecognitionResponse(res) ? res.document : undefined;
      })
      .then((document) => {
        if (!document) return;
        const caseId = document.routedCaseId;
        if (caseId) {
          return Promise.all([
            fetch(`${base}/cases/${caseId}/bill-line-items`, { headers, ...opts }).then(parseJsonResponse),
            fetch(`${base}/cases/${caseId}/timeline`, { headers, ...opts }).then(parseJsonResponse),
          ]);
        }
        return null;
      })
      .then((results) => {
        if (!results) return;
        const [billRes, timelineRes] = results as [
          { ok?: boolean; items?: BillLine[] },
          { ok?: boolean; items?: TimelineEvent[] },
        ];
        if (billRes?.ok && Array.isArray(billRes.items)) {
          setBillLines(billRes.items.filter((i) => i.documentId === id));
        }
        if (timelineRes?.ok && Array.isArray(timelineRes.items)) {
          setTimelineEvents(timelineRes.items.filter((e) => e.documentId === id));
        }
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchExportPreview = useCallback(() => {
    if (!id) return;
    const base = getApiBase();
    fetch(`${base}/documents/${id}/export-preview`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((data: unknown) => {
        if (isExportPreviewResponse(data)) setExportPreview(data);
        else setExportPreview(null);
      })
      .catch(() => setExportPreview(null));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const base = getApiBase();
    const opts = getFetchOptions();
    const headers = getAuthHeader();
    fetch(`${base}/cases`, { headers, ...opts })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isCasesListResponse(res) && res.ok && Array.isArray(res.items)) setCases(res.items);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (doc?.id) fetchExportPreview();
  }, [doc?.id, fetchExportPreview]);

  async function handleClearDuplicate() {
    if (!id || !doc?.duplicateOfId) return;
    setClearDuplicateLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`${getApiBase()}/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ duplicateOfId: null }),
      });
      await parseJsonResponse(res);
      if (res.ok) setDoc((prev) => (prev ? { ...prev, duplicateOfId: null } : null));
      else setSaveError("Could not clear duplicate flag");
    } catch (e) {
      setSaveError((e as Error)?.message ?? "Request failed");
    } finally {
      setClearDuplicateLoading(false);
    }
  }

  const saveRecognition = useCallback(async () => {
    if (!id) return;
    const base = getApiBase();
    setSaving(true);
    setSaveError(null);
    const body: Record<string, string | null> = {};
    if (docType !== (recognition?.docType ?? "")) body.docType = docType || null;
    if (providerName !== (recognition?.providerName ?? "")) body.providerName = providerName || null;
    if (incidentDate !== (recognition?.incidentDate ? (recognition.incidentDate as string).slice(0, 10) : "")) body.incidentDate = incidentDate || null;
    if (Object.keys(body).length > 0) {
      try {
        const res = await fetch(`${base}/documents/${id}/recognition`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify(body),
        });
        const data = await parseJsonResponse(res);
        if (!res.ok) {
          setSaveError((data as { error?: string })?.error ?? "Failed to save");
          return;
        }
        setRecognition((r) => (r ? { ...r, docType: docType || r.docType, providerName: providerName || r.providerName, incidentDate: incidentDate || r.incidentDate } : r));
      } catch (e) {
        setSaveError((e as Error)?.message ?? "Request failed");
        return;
      }
    }
    const meta = (doc?.metaJson ?? {}) as Record<string, unknown>;
    const currentName = meta.exportFileNameOverride != null ? String(meta.exportFileNameOverride) : "";
    const currentFolder = meta.exportFolderPathOverride != null ? String(meta.exportFolderPathOverride) : "";
    if (exportFileNameOverride !== currentName || exportFolderPathOverride !== currentFolder) {
      try {
        const res = await fetch(`${base}/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({
            exportFileNameOverride: exportFileNameOverride || null,
            exportFolderPathOverride: exportFolderPathOverride || null,
          }),
        });
        const data = await parseJsonResponse(res);
        if (!res.ok) {
          setSaveError((data as { error?: string })?.error ?? "Failed to save export overrides");
          return;
        }
        setDoc((d) => (d ? { ...d, metaJson: { ...(d.metaJson as Record<string, unknown>), exportFileNameOverride: exportFileNameOverride || null, exportFolderPathOverride: exportFolderPathOverride || null } } : d));
      } catch (e) {
        setSaveError((e as Error)?.message ?? "Request failed");
        return;
      }
    }
    fetchExportPreview();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
    setSaving(false);
  }, [id, doc, recognition, docType, providerName, incidentDate, exportFileNameOverride, exportFolderPathOverride, fetchExportPreview]);

  const assignCase = useCallback(async () => {
    if (!id || !caseId.trim()) return;
    const base = getApiBase();
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${base}/documents/${id}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ caseId: caseId.trim() }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        setSaveError((data as { error?: string })?.error ?? "Failed to assign case");
        setSaving(false);
        return;
      }
      setDoc((d) => (d ? { ...d, routedCaseId: caseId.trim() } : d));
      fetchExportPreview();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      setSaveError((e as Error)?.message ?? "Request failed");
    }
    setSaving(false);
  }, [id, caseId, fetchExportPreview]);

  if (loading && !doc) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Documents", href: "/dashboard/documents" }, { label: "…" }]} title="Document" description="Loading…" />
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading document…</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Documents", href: "/dashboard/documents" }]} title="Document" />
        <div className="onyx-card" style={{ padding: "1.25rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error ?? "Document not found."}</p>
          <Link href="/dashboard/documents" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem" }}>Back to documents</Link>
        </div>
      </div>
    );
  }

  const extracted = doc.extractedFields && typeof doc.extractedFields === "object" ? doc.extractedFields : {};
  const needsReview =
    doc.routingStatus === "needs_review" ||
    (recognition != null && (recognition.matchConfidence ?? 1) < 0.8) ||
    (recognition != null && (recognition.confidence ?? 1) < 0.7);
  const lowConfidence = (recognition?.confidence != null && recognition.confidence < 0.7) || (recognition?.matchConfidence != null && recognition.matchConfidence < 0.8);

  return ( <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Documents", href: "/dashboard/documents" }, { label: doc.originalName }]}
        title={doc.originalName}
        description={`${doc.status} · ${doc.pageCount ?? 0} pages${needsReview ? " · Needs review" : ""}`}
      />

      {(needsReview || lowConfidence) && (
        <div style={{ marginBottom: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {needsReview && (
            <span className="onyx-badge" style={{ fontSize: "0.75rem", background: "var(--onyx-warning)", color: "var(--onyx-bg)" }}>Needs review</span>
          )}
          {lowConfidence && !needsReview && (
            <span style={{ fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Low confidence</span>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <DocumentPreview id={doc.id} name={doc.originalName} status={doc.status} pageCount={doc.pageCount ?? undefined} showPreview={true} />

        {/* Processing status & error */}
        <DashboardCard title="Processing status">
          <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Status:</strong> {doc.status}</p>
          {doc.routingStatus && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Routing:</strong> {doc.routingStatus}</p>}
          {doc.lastRunAt && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Last run: {new Date(doc.lastRunAt).toLocaleString()}</p>}
          {doc.ingestedAt && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Ingested: {new Date(doc.ingestedAt).toLocaleString()}</p>}
        </DashboardCard>

        {(doc.status === "FAILED" || doc.errors) && (
          <div className="onyx-card" style={{ padding: "1.25rem", borderColor: "var(--onyx-error)", background: "rgba(239, 68, 68, 0.06)" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 600 }}>Processing error</h3>
            <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{doc.errors ?? "Document processing failed."}</p>
            {doc.pipelineStage && <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Stage: {doc.pipelineStage}</p>}
            {doc.status === "FAILED" && (
              <button
                type="button"
                onClick={async () => {
                  if (!id) return;
                  setReprocessError(null);
                  try {
                    const res = await fetch(`${getApiBase()}/documents/${id}/reprocess`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...getAuthHeader() },
                      ...getFetchOptions(),
                      body: JSON.stringify({ mode: "full" }),
                    });
                    const data = await parseJsonResponse(res);
                    if (res.ok && (data as { ok?: boolean }).ok) {
                      setLoading(true);
                      window.location.reload();
                    } else setReprocessError((data as { error?: string })?.error ?? "Retry failed");
                  } catch (e) {
                    setReprocessError((e as Error)?.message ?? "Request failed");
                  }
                }}
                className="onyx-btn-primary"
                style={{ marginTop: "0.75rem" }}
              >
                Retry processing
              </button>
            )}
            {reprocessError && <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-error)" }}>{reprocessError}</p>}
          </div>
        )}

        {(doc.duplicateOfId || (doc.duplicateMatchCount ?? 0) > 0) && (
          <DashboardCard title="Duplicate">
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              {doc.duplicateOfId ? "This document is a duplicate." : `Referenced by ${doc.duplicateMatchCount} duplicate(s).`}
            </p>
            {doc.duplicateOfId && (
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
                <Link href={`/dashboard/documents/${doc.duplicateOfId}`} className="onyx-link">View original document</Link>
                <span style={{ margin: "0 0.5rem", color: "var(--onyx-text-muted)" }}>·</span>
                <button type="button" className="onyx-link" style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.875rem" }} onClick={handleClearDuplicate} disabled={clearDuplicateLoading}>
                  {clearDuplicateLoading ? "…" : "Mark not duplicate"}
                </button>
              </p>
            )}
          </DashboardCard>
        )}

        {recognition && (
          <DashboardCard title="Classification & routing">
            <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Doc type:</strong> {recognition.docType ?? "—"}</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Confidence:</strong> {recognition.confidence != null ? `${Math.round(recognition.confidence * 100)}%` : "—"}</p>
            {recognition.classificationReason && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{recognition.classificationReason}</p>}
            {Array.isArray(recognition.classificationSignals) && recognition.classificationSignals.length > 0 && (
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Signals: {recognition.classificationSignals.join(", ")}</p>
            )}
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}><strong>Provider:</strong> {recognition.providerName ?? "—"}</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Facility:</strong> {recognition.facilityName ?? "—"}</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}><strong>Match confidence:</strong> {recognition.matchConfidence != null ? `${Math.round(recognition.matchConfidence * 100)}%` : "—"}</p>
            {(recognition.matchReason || recognition.unmatchedReason) && (
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{recognition.matchReason ?? recognition.unmatchedReason}</p>
            )}
          </DashboardCard>
        )}

        {/* Case: routed and/or suggested */}
        {(doc.routedCaseId || recognition?.suggestedCaseId) && (
          <DashboardCard title="Case">
            {doc.routedCaseId && (
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                <strong>Routed case:</strong> <Link href={`/dashboard/cases/${doc.routedCaseId}`} className="onyx-link">View case</Link>
                <span style={{ marginLeft: "0.5rem" }}>·</span>
                <Link href={`/dashboard/cases/${doc.routedCaseId}`} className="onyx-link" style={{ marginLeft: "0.25rem" }}>Timeline</Link>
              </p>
            )}
            {recognition?.suggestedCaseId && recognition.suggestedCaseId !== doc.routedCaseId && (
              <p style={{ margin: doc.routedCaseId ? "0.5rem 0 0" : 0, fontSize: "0.875rem" }}>
                <strong>Suggested case:</strong> <Link href={`/dashboard/cases/${recognition.suggestedCaseId}`} className="onyx-link">View case</Link>
              </p>
            )}
          </DashboardCard>
        )}

        {/* Correct filing decisions: case, provider, doc type, service date, export overrides */}
        <DashboardCard title="Correct filing decisions">
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            Edit values below and save. These are used for export file naming and folder structure.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 420 }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Case</label>
              <select
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
              >
                <option value="">— Select case —</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.caseNumber, c.clientName, c.title].filter(Boolean).join(" · ") || c.id}
                  </option>
                ))}
              </select>
              <button type="button" onClick={assignCase} disabled={saving || !caseId.trim()} className="onyx-btn-primary" style={{ marginTop: "0.5rem" }}>
                {saving ? "Saving…" : "Assign case"}
              </button>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Provider</label>
              <input
                type="text"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                className="onyx-input"
                placeholder="Provider name"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Document type</label>
              <input
                type="text"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="onyx-input"
                placeholder="e.g. medical_record, EOB"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Service date</label>
              <input
                type="date"
                value={incidentDate}
                onChange={(e) => setIncidentDate(e.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Export file name override</label>
              <input
                type="text"
                value={exportFileNameOverride}
                onChange={(e) => setExportFileNameOverride(e.target.value)}
                className="onyx-input"
                placeholder="Leave blank to use naming rules"
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Export folder override</label>
              <input
                type="text"
                value={exportFolderPathOverride}
                onChange={(e) => setExportFolderPathOverride(e.target.value)}
                className="onyx-input"
                placeholder="e.g. Medical/EOB (leave blank for rules)"
                style={{ width: "100%" }}
              />
            </div>
            {saveError && <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-error)" }}>{saveError}</p>}
            {saveSuccess && <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-success)" }}>Saved.</p>}
            <button type="button" onClick={saveRecognition} disabled={saving} className="onyx-btn-primary" style={{ alignSelf: "flex-start" }}>
              {saving ? "Saving…" : "Save corrections"}
            </button>
          </div>
        </DashboardCard>

        {/* Export preview: final file name and folder */}
        <DashboardCard title="Export preview">
          {exportPreview == null ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Loading…</p>
          ) : exportPreview.needsRouting ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{exportPreview.message ?? "Assign a case to see export path."}</p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>File name:</strong> {exportPreview.fileName ?? "—"}</p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Folder path:</strong> {exportPreview.folderPath ?? "—"}</p>
              {exportPreview.context && (
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                  Based on: {exportPreview.context.documentType}, {exportPreview.context.providerName}, service date {exportPreview.context.serviceDate}
                </p>
              )}
            </>
          )}
        </DashboardCard>

        {recognition?.textExcerpt && (
          <DashboardCard title="OCR text">
            {(recognition.ocrEngine || recognition.ocrConfidence != null || recognition.pageCountDetected != null) && (
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
                {recognition.ocrEngine && <span>Engine: {recognition.ocrEngine}</span>}
                {recognition.ocrConfidence != null && <span style={{ marginLeft: "0.5rem" }}>Confidence: {Math.round(recognition.ocrConfidence * 100)}%</span>}
                {recognition.pageCountDetected != null && <span style={{ marginLeft: "0.5rem" }}>Pages detected: {recognition.pageCountDetected}</span>}
              </p>
            )}
            <pre style={{ margin: 0, fontSize: "0.8125rem", overflow: "auto", maxHeight: 300, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {recognition.textExcerpt.length > 10000 ? recognition.textExcerpt.slice(0, 10000) + "\n\n… (truncated)" : recognition.textExcerpt}
            </pre>
          </DashboardCard>
        )}

        {recognition && (recognition.insuranceFields || recognition.courtFields) && (
          <DashboardCard title="Structured extraction">
            {recognition.insuranceFields && typeof recognition.insuranceFields === "object" && (
              <div style={{ marginBottom: recognition.courtFields ? "0.75rem" : 0 }}>
                <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Insurance</p>
                <pre style={{ margin: 0, fontSize: "0.8125rem", overflow: "auto", maxHeight: 200 }}>{JSON.stringify(recognition.insuranceFields, null, 2)}</pre>
              </div>
            )}
            {recognition.courtFields && typeof recognition.courtFields === "object" && (
              <div>
                <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Court</p>
                <pre style={{ margin: 0, fontSize: "0.8125rem", overflow: "auto", maxHeight: 200 }}>{JSON.stringify(recognition.courtFields, null, 2)}</pre>
              </div>
            )}
          </DashboardCard>
        )}

        {(Object.keys(extracted).length > 0 || (recognition?.extractedJson && typeof recognition.extractedJson === "object" && Object.keys(recognition.extractedJson).length > 0)) && (
          <DashboardCard title="Extracted fields">
            {Object.keys(extracted).length > 0 && (
              <div style={{ marginBottom: recognition?.extractedJson && Object.keys(recognition.extractedJson as object).length > 0 ? "0.75rem" : 0 }}>
                <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Document</p>
                <pre style={{ margin: 0, fontSize: "0.8125rem", overflow: "auto", maxHeight: 300 }}>{JSON.stringify(extracted, null, 2)}</pre>
              </div>
            )}
            {recognition?.extractedJson && typeof recognition.extractedJson === "object" && Object.keys(recognition.extractedJson).length > 0 && (
              <div>
                <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Recognition</p>
                <pre style={{ margin: 0, fontSize: "0.8125rem", overflow: "auto", maxHeight: 300 }}>{JSON.stringify(recognition.extractedJson, null, 2)}</pre>
              </div>
            )}
          </DashboardCard>
        )}

        {billLines.length > 0 && (
          <DashboardCard title="Billing (this document)">
            <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--onyx-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Provider</th>
                  <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Service date</th>
                  <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>CPT / Procedure</th>
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Charged</th>
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Paid</th>
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {billLines.map((line) => (
                  <tr key={line.id} style={{ borderBottom: "1px solid var(--onyx-border)" }}>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{line.providerName ?? "—"}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{line.serviceDate ? new Date(line.serviceDate).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{(line.cptCode || line.procedureDescription) ? [line.cptCode, line.procedureDescription].filter(Boolean).join(" · ") : "—"}</td>
                    <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{line.amountCharged != null ? `$${Number(line.amountCharged).toLocaleString()}` : "—"}</td>
                    <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{line.amountPaid != null ? `$${Number(line.amountPaid).toLocaleString()}` : "—"}</td>
                    <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{line.balance != null ? `$${Number(line.balance).toLocaleString()}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DashboardCard>
        )}

        {timelineEvents.length > 0 && ( <div><DashboardCard title="Timeline events (from this document)">
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
              {timelineEvents.map((ev) => ( <li key={ev.id} style={{ marginBottom: "0.25rem" }}>
                  <strong>{ev.eventDate ? new Date(ev.eventDate).toLocaleDateString() : "—"}</strong>
                  {" "}{ev.eventType ?? "—"}
                  {ev.track && <span style={{ color: "var(--onyx-text-muted)", marginLeft: "0.25rem" }}>({ev.track})</span>}
                  {ev.provider && <span style={{ marginLeft: "0.25rem" }}>{" — "}{ev.provider}</span>}
                  {ev.diagnosis && <span style={{ marginLeft: "0.25rem" }}>{" — "}{ev.diagnosis}</span>}
                  {ev.procedure && <span style={{ marginLeft: "0.25rem" }}>{" — "}{ev.procedure}</span>}
                  {ev.amount && <span style={{ marginLeft: "0.25rem" }}>{" — "}{ev.amount}</span>}
                </li>
              ))}
            </ul>
          </DashboardCard></div>
        )}

        {recognition?.qualityScore != null && (
          <DashboardCard title="Quality">
            <p style={{ margin: 0, fontSize: "0.875rem" }}>Score: {Math.round(recognition.qualityScore * 100)}%</p>
            {recognition.issuesJson != null && (
              <pre style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", overflow: "auto", maxHeight: 120 }}>
                {typeof recognition.issuesJson === "string" ? recognition.issuesJson : JSON.stringify(recognition.issuesJson, null, 2)}
              </pre>
            )}
          </DashboardCard>
        )}
      </div>
    </div>
  );
}
