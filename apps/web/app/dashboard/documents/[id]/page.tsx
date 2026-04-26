"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DocumentPreview } from "@/components/dashboard/DocumentPreview";
import { DocumentExplainPanel } from "@/components/dashboard/DocumentExplainPanel";
import { useDashboardAuth } from "@/contexts/DashboardAuthContext";

type Doc = {
  id: string;
  originalName: string;
  status: string;
  reviewState?: string | null;
  pageCount: number | null;
  source?: string;
  mimeType?: string | null;
  confidence?: number | null;
  routedCaseId: string | null;
  routingStatus: string | null;
  routingConfidence?: number | null;
  routingReason?: string | null;
  routingSourceFields?: Record<string, unknown> | null;
  routingDecision?: RoutingDecision | null;
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
};

type RoutingDecision = {
  document_type?: string | null;
  client_name?: string | null;
  date_of_loss?: string | null;
  provider?: string | null;
  claim_number?: string | null;
  matched_case_id?: string | null;
  confidence_score?: number | null;
  reasoning?: string[];
  review_required?: boolean;
  source_fields?: Record<string, unknown>;
  candidate_summaries?: string[];
};

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
};

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
};

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
};

type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  fromCaseId: string | null;
  toCaseId: string | null;
  metaJson?: unknown;
  createdAt: string;
};

type DuplicatesInfo = {
  original: { id: string; originalName: string } | null;
  duplicates: Array<{ id: string; originalName: string }>;
};

type DocumentRecognitionResponse = { ok?: boolean; document?: Doc; recognition?: Recognition; error?: string };

type CasesListResponse = { ok?: boolean; items?: CaseItem[] };
type AuditResponse = { ok?: boolean; items?: AuditEvent[]; error?: string };
type DuplicatesResponse = { ok?: boolean; original?: DuplicatesInfo["original"]; duplicates?: DuplicatesInfo["duplicates"]; error?: string };

type ActionFeedback = { type: "success" | "error"; message: string } | null;

function isDocumentRecognitionResponse(res: unknown): res is DocumentRecognitionResponse {
  return typeof res === "object" && res !== null;
}

function isExportPreviewResponse(res: unknown): res is ExportPreview {
  return typeof res === "object" && res !== null;
}

function isCasesListResponse(res: unknown): res is CasesListResponse {
  return typeof res === "object" && res !== null;
}

function isAuditResponse(res: unknown): res is AuditResponse {
  return typeof res === "object" && res !== null;
}

function isDuplicatesResponse(res: unknown): res is DuplicatesResponse {
  return typeof res === "object" && res !== null;
}

function formatStatusLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusBadgeClass(status: string | null | undefined): string {
  if (status === "UPLOADED") return "onyx-badge onyx-badge-success";
  if (status === "FAILED") return "onyx-badge onyx-badge-error";
  if (status === "NEEDS_REVIEW" || status === "UNMATCHED") return "onyx-badge onyx-badge-warning";
  return "onyx-badge onyx-badge-neutral";
}

function reviewBadgeClass(reviewState: string | null | undefined): string {
  if (reviewState === "APPROVED" || reviewState === "EXPORT_READY") return "onyx-badge onyx-badge-success";
  if (reviewState === "REJECTED") return "onyx-badge onyx-badge-error";
  if (reviewState === "IN_REVIEW") return "onyx-badge onyx-badge-warning";
  return "onyx-badge onyx-badge-neutral";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatPercent(value: number | null | undefined): string {
  return value != null ? `${Math.round(value * 100)}%` : "-";
}

function normalizeSignalList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

export default function DocumentDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { user } = useDashboardAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicatesInfo>({ original: null, duplicates: [] });
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
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
  const [actionState, setActionState] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback>(null);

  const fetchExportPreview = useCallback(async () => {
    if (!id) return;
    try {
      const response = await fetch(`${getApiBase()}/documents/${id}/export-preview`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = await parseJsonResponse(response);
      if (isExportPreviewResponse(data)) setExportPreview(data);
      else setExportPreview(null);
    } catch {
      setExportPreview(null);
    }
  }, [id]);

  const loadDocument = useCallback(async () => {
    if (!id) return;
    const base = getApiBase();
    const headers = getAuthHeader();
    const opts = getFetchOptions();

    setLoading(true);
    setError(null);

    try {
      const recognitionResponse = await fetch(`${base}/documents/${id}/recognition`, { headers, ...opts });
      const recognitionData = await parseJsonResponse(recognitionResponse);
      if (!isDocumentRecognitionResponse(recognitionData) || !recognitionData.ok || !recognitionData.document) {
        throw new Error(recognitionData && typeof recognitionData === "object" && "error" in recognitionData ? String((recognitionData as { error?: string }).error ?? "Document not found") : "Document not found");
      }

      const nextDoc = recognitionData.document;
      const nextRecognition = recognitionData.recognition ?? null;

      setDoc(nextDoc);
      setRecognition(nextRecognition);
      setCaseId(nextDoc.routedCaseId ?? "");
      setProviderName(nextRecognition?.providerName ?? "");
      setDocType(nextRecognition?.docType ?? "");
      setIncidentDate(nextRecognition?.incidentDate ? String(nextRecognition.incidentDate).slice(0, 10) : "");
      setExportFileNameOverride(nextDoc.metaJson?.exportFileNameOverride != null ? String(nextDoc.metaJson.exportFileNameOverride) : "");
      setExportFolderPathOverride(nextDoc.metaJson?.exportFolderPathOverride != null ? String(nextDoc.metaJson.exportFolderPathOverride) : "");

      const [casesRes, duplicatesRes, auditRes, routedData] = await Promise.all([
        fetch(`${base}/cases`, { headers, ...opts }).then(parseJsonResponse).catch(() => null),
        fetch(`${base}/documents/${id}/duplicates`, { headers, ...opts }).then(parseJsonResponse).catch(() => null),
        fetch(`${base}/documents/${id}/audit`, { headers, ...opts }).then(parseJsonResponse).catch(() => null),
        nextDoc.routedCaseId
          ? Promise.all([
              fetch(`${base}/cases/${nextDoc.routedCaseId}/bill-line-items`, { headers, ...opts }).then(parseJsonResponse).catch(() => null),
              fetch(`${base}/cases/${nextDoc.routedCaseId}/timeline`, { headers, ...opts }).then(parseJsonResponse).catch(() => null),
            ])
          : Promise.resolve([null, null] as const),
      ]);

      if (isCasesListResponse(casesRes) && casesRes.ok && Array.isArray(casesRes.items)) setCases(casesRes.items);
      else setCases([]);

      if (isDuplicatesResponse(duplicatesRes) && duplicatesRes.ok) {
        setDuplicateInfo({
          original: duplicatesRes.original ?? null,
          duplicates: Array.isArray(duplicatesRes.duplicates) ? duplicatesRes.duplicates : [],
        });
      } else {
        setDuplicateInfo({ original: null, duplicates: [] });
      }

      if (isAuditResponse(auditRes) && auditRes.ok && Array.isArray(auditRes.items)) setAuditEvents(auditRes.items);
      else setAuditEvents([]);

      const [billRes, timelineRes] = routedData;
      if (billRes && typeof billRes === "object" && (billRes as { ok?: boolean }).ok && Array.isArray((billRes as { items?: BillLine[] }).items)) {
        setBillLines(((billRes as { items?: BillLine[] }).items ?? []).filter((item) => item.documentId === id));
      } else {
        setBillLines([]);
      }
      if (timelineRes && typeof timelineRes === "object" && (timelineRes as { ok?: boolean }).ok && Array.isArray((timelineRes as { items?: TimelineEvent[] }).items)) {
        setTimelineEvents(((timelineRes as { items?: TimelineEvent[] }).items ?? []).filter((item) => item.documentId === id));
      } else {
        setTimelineEvents([]);
      }

      void fetchExportPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [id, fetchExportPreview]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  async function runDocumentAction(
    actionKey: string,
    request: () => Promise<{ response: Response; data: unknown }>,
    successMessage: string
  ) {
    setActionState(actionKey);
    setActionFeedback(null);
    try {
      const { response, data } = await request();
      const payload = (data ?? {}) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? payload.message ?? "Action failed.");
      }
      await loadDocument();
      void fetchExportPreview();
      setActionFeedback({ type: "success", message: successMessage });
    } catch (e) {
      setActionFeedback({ type: "error", message: e instanceof Error ? e.message : "Request failed." });
    } finally {
      setActionState(null);
    }
  }

  async function fetchDownloadInfo(): Promise<{ url: string; originalName?: string }> {
    const response = await fetch(`${getApiBase()}/documents/${id}/download`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    });
    const data = (await parseJsonResponse(response)) as { ok?: boolean; url?: string; originalName?: string; error?: string };
    if (!response.ok || !data.ok || !data.url) {
      throw new Error(data.error ?? "Download failed.");
    }
    return { url: data.url, originalName: data.originalName };
  }

  async function handleOpenDocument() {
    if (!id) return;
    setDownloadLoading(true);
    setActionFeedback(null);
    try {
      const data = await fetchDownloadInfo();
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setActionFeedback({ type: "error", message: e instanceof Error ? e.message : "Request failed." });
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleDownloadDocument() {
    if (!id) return;
    setDownloadLoading(true);
    setActionFeedback(null);
    try {
      const data = await fetchDownloadInfo();
      const anchor = document.createElement("a");
      anchor.href = data.url;
      anchor.download = data.originalName ?? doc?.originalName ?? "document";
      anchor.click();
    } catch (e) {
      setActionFeedback({ type: "error", message: e instanceof Error ? e.message : "Request failed." });
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleApprove() {
    if (!id) return;
    await runDocumentAction(
      "approve",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}/approve`, {
          method: "POST",
          headers: getAuthHeader(),
          ...getFetchOptions(),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      "Document approved."
    );
  }

  async function handleReject() {
    if (!id) return;
    await runDocumentAction(
      "reject",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}/reject`, {
          method: "POST",
          headers: getAuthHeader(),
          ...getFetchOptions(),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      "Document rejected."
    );
  }

  async function handleClaim() {
    if (!id) return;
    const actor = user?.displayName || user?.email || "operator";
    await runDocumentAction(
      "claim",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({ user: actor }),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      `Document claimed by ${actor}.`
    );
  }

  async function handleUnclaim() {
    if (!id) return;
    const actor = user?.displayName || user?.email || "operator";
    await runDocumentAction(
      "unclaim",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}/unclaim`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({ user: actor }),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      "Document unclaimed."
    );
  }

  async function handleMarkNeedsReview() {
    if (!id) return;
    await runDocumentAction(
      "needs-review",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({ status: "NEEDS_REVIEW", routingStatus: "needs_review" }),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      "Document marked needs review."
    );
  }

  async function handleMarkUnmatched() {
    if (!id) return;
    await runDocumentAction(
      "unmatched",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({ status: "UNMATCHED", routedCaseId: null, routingStatus: null }),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      "Document marked unmatched."
    );
  }

  async function handleAssignCase() {
    if (!id || !caseId.trim()) return;
    await runDocumentAction(
      "route",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({ caseId: caseId.trim() }),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      "Document routed to case."
    );
  }

  async function handleClearDuplicate() {
    if (!id || !doc?.duplicateOfId) return;
    await runDocumentAction(
      "clear-duplicate",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({ duplicateOfId: null }),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      "Duplicate override cleared."
    );
  }

  async function handleReprocess() {
    if (!id) return;
    await runDocumentAction(
      "reprocess",
      async () => {
        const response = await fetch(`${getApiBase()}/documents/${id}/reprocess`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({ mode: "full" }),
        });
        const data = await parseJsonResponse(response);
        return { response, data };
      },
      "Document reprocessing started."
    );
  }

  const saveRecognition = useCallback(async () => {
    if (!id) return;
    const base = getApiBase();
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, string | null> = {};
      if (docType !== (recognition?.docType ?? "")) body.docType = docType || null;
      if (providerName !== (recognition?.providerName ?? "")) body.providerName = providerName || null;
      if (incidentDate !== (recognition?.incidentDate ? String(recognition.incidentDate).slice(0, 10) : "")) body.incidentDate = incidentDate || null;

      if (Object.keys(body).length > 0) {
        const response = await fetch(`${base}/documents/${id}/recognition`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify(body),
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) {
          setSaveError((data as { error?: string })?.error ?? "Failed to save.");
          setSaving(false);
          return;
        }
      }

      const meta = (doc?.metaJson ?? {}) as Record<string, unknown>;
      const currentName = meta.exportFileNameOverride != null ? String(meta.exportFileNameOverride) : "";
      const currentFolder = meta.exportFolderPathOverride != null ? String(meta.exportFolderPathOverride) : "";
      if (exportFileNameOverride !== currentName || exportFolderPathOverride !== currentFolder) {
        const response = await fetch(`${base}/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({
            exportFileNameOverride: exportFileNameOverride || null,
            exportFolderPathOverride: exportFolderPathOverride || null,
          }),
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) {
          setSaveError((data as { error?: string })?.error ?? "Failed to save export overrides.");
          setSaving(false);
          return;
        }
      }

      await loadDocument();
      void fetchExportPreview();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setSaving(false);
    }
  }, [id, doc, recognition, docType, providerName, incidentDate, exportFileNameOverride, exportFolderPathOverride, loadDocument, fetchExportPreview]);

  const auditTrail = useMemo(
    () => [...auditEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [auditEvents]
  );

  const currentClaimedBy = useMemo(() => {
    for (const event of auditTrail) {
      if (event.action === "claimed") return event.actor;
      if (event.action === "unclaimed") return null;
    }
    return null;
  }, [auditTrail]);

  if (loading && !doc) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Documents", href: "/dashboard/documents" }, { label: "..." }]} title="Document" description="Loading..." />
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading document...</p>
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
    doc.status === "NEEDS_REVIEW" ||
    doc.reviewState === "IN_REVIEW" ||
    (recognition != null && (recognition.matchConfidence ?? 1) < 0.8) ||
    (recognition != null && (recognition.confidence ?? 1) < 0.7);
  const lowConfidence = (recognition?.confidence != null && recognition.confidence < 0.7) || (recognition?.matchConfidence != null && recognition.matchConfidence < 0.8);
  const routingDecision = doc.routingDecision ?? null;
  const routingConfidence = doc.routingConfidence ?? routingDecision?.confidence_score ?? recognition?.matchConfidence ?? null;
  const routingReason = doc.routingReason ?? routingDecision?.reasoning?.[0] ?? recognition?.matchReason ?? recognition?.unmatchedReason ?? null;
  const routingReasons = [
    ...(routingDecision?.reasoning ?? []),
    ...(routingDecision?.candidate_summaries ?? []),
  ].filter((reason, index, list) => typeof reason === "string" && reason.trim().length > 0 && list.indexOf(reason) === index);
  const routingFields = routingDecision?.source_fields ?? doc.routingSourceFields ?? {};
  const routedCaseLabel = doc.routedCaseId
    ? "Routed to attached case"
    : recognition?.suggestedCaseId || routingDecision?.matched_case_id
      ? "Needs review - suggested case"
      : "Needs review - low confidence";
  const pageDescriptionParts = [formatStatusLabel(doc.status), `${doc.pageCount ?? 0} pages`];
  if (doc.reviewState) pageDescriptionParts.push(formatStatusLabel(doc.reviewState));
  if (needsReview) pageDescriptionParts.push("Needs review");
  const pageDescription = pageDescriptionParts.join(" · ");

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Documents", href: "/dashboard/documents" }, { label: doc.originalName }]}
        title={doc.originalName}
        description={pageDescription}
      />

      {actionFeedback && (
        <div
          className="onyx-card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
            borderColor: actionFeedback.type === "error" ? "var(--onyx-error)" : "var(--onyx-success)",
            background: actionFeedback.type === "error" ? "rgba(239, 68, 68, 0.06)" : "rgba(34, 197, 94, 0.08)",
          }}
        >
          <p style={{ margin: 0, color: actionFeedback.type === "error" ? "var(--onyx-error)" : "var(--onyx-success)", fontSize: "0.875rem", fontWeight: 500 }}>
            {actionFeedback.message}
          </p>
        </div>
      )}

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
        <DocumentPreview
          id={doc.id}
          name={doc.originalName}
          type={doc.mimeType ?? undefined}
          status={doc.status}
          pageCount={doc.pageCount ?? undefined}
          ocrText={recognition?.textExcerpt ?? null}
          showPreview={true}
        />

        <DashboardCard title="Operator action center">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <span className={statusBadgeClass(doc.status)}>{formatStatusLabel(doc.status)}</span>
            <span className={reviewBadgeClass(doc.reviewState)}>{formatStatusLabel(doc.reviewState ?? "unreviewed")}</span>
            <span className={currentClaimedBy ? "onyx-badge onyx-badge-warning" : "onyx-badge onyx-badge-neutral"}>
              {currentClaimedBy ? `Claimed by ${currentClaimedBy}` : "Unclaimed"}
            </span>
            <span className={doc.routedCaseId ? "onyx-badge onyx-badge-info" : "onyx-badge onyx-badge-warning"}>
              {doc.routedCaseId ? "Routed" : "No routed case"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button type="button" onClick={handleOpenDocument} disabled={downloadLoading} className="onyx-btn-primary">
              {downloadLoading ? "Opening..." : "Open"}
            </button>
            <button type="button" onClick={handleDownloadDocument} disabled={downloadLoading} className="onyx-btn-secondary">
              {downloadLoading ? "Preparing..." : "Download"}
            </button>
            <button type="button" onClick={handleReprocess} disabled={actionState !== null} className="onyx-btn-secondary">
              {actionState === "reprocess" ? "Working..." : "Reprocess"}
            </button>
            <button type="button" onClick={handleApprove} disabled={actionState !== null} className="onyx-btn-primary">
              {actionState === "approve" ? "Working..." : "Approve"}
            </button>
            <button type="button" onClick={handleReject} disabled={actionState !== null} className="onyx-btn-secondary" style={{ borderColor: "var(--onyx-error)", color: "var(--onyx-error)" }}>
              {actionState === "reject" ? "Working..." : "Reject"}
            </button>
            {currentClaimedBy ? (
              <button type="button" onClick={handleUnclaim} disabled={actionState !== null} className="onyx-btn-secondary">
                {actionState === "unclaim" ? "Working..." : "Unclaim"}
              </button>
            ) : (
              <button type="button" onClick={handleClaim} disabled={actionState !== null} className="onyx-btn-secondary">
                {actionState === "claim" ? "Working..." : "Claim"}
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--onyx-text-muted)" }}>Route to case</label>
              <select value={caseId} onChange={(event) => setCaseId(event.target.value)} className="onyx-input" style={{ width: "100%" }}>
                <option value="">- Select case -</option>
                {cases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {[item.caseNumber, item.clientName, item.title].filter(Boolean).join(" · ") || item.id}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                <button type="button" onClick={handleAssignCase} disabled={actionState !== null || !caseId.trim()} className="onyx-btn-primary">
                  {actionState === "route" ? "Routing..." : "Assign case"}
                </button>
                <button type="button" onClick={handleMarkNeedsReview} disabled={actionState !== null} className="onyx-btn-secondary">
                  {actionState === "needs-review" ? "Working..." : "Mark needs review"}
                </button>
                <button type="button" onClick={handleMarkUnmatched} disabled={actionState !== null} className="onyx-btn-secondary">
                  {actionState === "unmatched" ? "Working..." : "Mark unmatched"}
                </button>
              </div>
            </div>

            <div>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Duplicate handling</p>
              {duplicateInfo.original ? (
                <p style={{ margin: 0, fontSize: "0.875rem" }}>
                  Duplicate of <Link href={`/dashboard/documents/${duplicateInfo.original.id}`} className="onyx-link">{duplicateInfo.original.originalName || duplicateInfo.original.id}</Link>
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No parent duplicate link.</p>
              )}
              {duplicateInfo.duplicates.length > 0 && (
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
                  Related duplicates: {duplicateInfo.duplicates.map((item, index) => (
                    <Fragment key={item.id}>
                      {index > 0 ? <span>, </span> : null}
                      <Link href={`/dashboard/documents/${item.id}`} className="onyx-link">{item.originalName || item.id}</Link>
                    </Fragment>
                  ))}
                </p>
              )}
              {doc.duplicateOfId && (
                <button type="button" onClick={handleClearDuplicate} disabled={actionState !== null} className="onyx-btn-secondary" style={{ marginTop: "0.5rem" }}>
                  {actionState === "clear-duplicate" ? "Working..." : "Mark not duplicate"}
                </button>
              )}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            Ingested {formatDateTime(doc.ingestedAt)}{doc.lastRunAt ? ` · last run ${formatDateTime(doc.lastRunAt)}` : ""}
          </p>
        </DashboardCard>

        <DashboardCard title="Processing status">
          <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Status:</strong> {formatStatusLabel(doc.status)}</p>
          {doc.reviewState && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Review state:</strong> {formatStatusLabel(doc.reviewState)}</p>}
          {doc.routingStatus && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Routing:</strong> {formatStatusLabel(doc.routingStatus)}</p>}
          {doc.mimeType && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>MIME:</strong> {doc.mimeType}</p>}
          {doc.lastRunAt && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Last run: {formatDateTime(doc.lastRunAt)}</p>}
          {doc.ingestedAt && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Ingested: {formatDateTime(doc.ingestedAt)}</p>}
        </DashboardCard>

        {(doc.status === "FAILED" || doc.errors) && (
          <div className="onyx-card" style={{ padding: "1.25rem", borderColor: "var(--onyx-error)", background: "rgba(239, 68, 68, 0.06)" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 600 }}>Processing error</h3>
            <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{doc.errors ?? "Document processing failed."}</p>
            {doc.pipelineStage && <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Stage: {doc.pipelineStage}</p>}
            <button type="button" onClick={handleReprocess} className="onyx-btn-primary" style={{ marginTop: "0.75rem" }} disabled={actionState !== null}>
              {actionState === "reprocess" ? "Working..." : "Retry processing"}
            </button>
          </div>
        )}

        {(recognition || routingDecision) && (
          <DashboardCard title="Routing Decision">
            <div style={{ display: "grid", gap: "0.65rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <span className={doc.routedCaseId ? "onyx-badge onyx-badge-success" : "onyx-badge onyx-badge-warning"}>
                  {routedCaseLabel}
                </span>
                <span className="onyx-badge onyx-badge-neutral">
                  Confidence {formatPercent(routingConfidence)}
                </span>
                {recognition?.confidence != null && (
                  <span className="onyx-badge onyx-badge-neutral">
                    Classification {formatPercent(recognition.confidence)}
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--onyx-text-secondary)", lineHeight: 1.55 }}>
                {routingReason ||
                  "The router did not record a detailed case-match reason for this document."}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.65rem" }}>
                <div className="onyx-card" style={{ padding: "0.75rem" }}>
                  <p style={{ margin: "0 0 0.2rem", fontSize: "0.72rem", color: "var(--onyx-text-muted)" }}>Client</p>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>{routingDecision?.client_name ?? recognition?.clientName ?? String(routingFields.client_name ?? "-")}</p>
                </div>
                <div className="onyx-card" style={{ padding: "0.75rem" }}>
                  <p style={{ margin: "0 0 0.2rem", fontSize: "0.72rem", color: "var(--onyx-text-muted)" }}>Date of loss</p>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>{routingDecision?.date_of_loss ?? recognition?.incidentDate ?? String(routingFields.date_of_loss ?? "-")}</p>
                </div>
                <div className="onyx-card" style={{ padding: "0.75rem" }}>
                  <p style={{ margin: "0 0 0.2rem", fontSize: "0.72rem", color: "var(--onyx-text-muted)" }}>Provider</p>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>{routingDecision?.provider ?? recognition?.providerName ?? recognition?.facilityName ?? String(routingFields.provider ?? "-")}</p>
                </div>
                <div className="onyx-card" style={{ padding: "0.75rem" }}>
                  <p style={{ margin: "0 0 0.2rem", fontSize: "0.72rem", color: "var(--onyx-text-muted)" }}>Claim or case number</p>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>{routingDecision?.claim_number ?? recognition?.caseNumber ?? String(routingFields.claim_number ?? routingFields.case_number ?? "-")}</p>
                </div>
              </div>
              {routingReasons.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--onyx-text-muted)", fontSize: "0.85rem", lineHeight: 1.55 }}>
                  {routingReasons.slice(0, 5).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              {normalizeSignalList(recognition?.classificationSignals).length > 0 ? (
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
                  Signals: {normalizeSignalList(recognition?.classificationSignals).join(", ")}
                </p>
              ) : null}
              {!doc.routedCaseId ? (
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
                  This document stayed in review because the router did not have enough confidence to attach it automatically.
                </p>
              ) : null}
            </div>
          </DashboardCard>
        )}

        {recognition && (
          <DashboardCard title="Classification & routing">
            <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Doc type:</strong> {recognition.docType ?? "-"}</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Confidence:</strong> {formatPercent(recognition.confidence)}</p>
            {recognition.classificationReason && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{recognition.classificationReason}</p>}
            {Array.isArray(recognition.classificationSignals) && recognition.classificationSignals.length > 0 && (
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Signals: {recognition.classificationSignals.join(", ")}</p>
            )}
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}><strong>Provider:</strong> {recognition.providerName ?? "-"}</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Facility:</strong> {recognition.facilityName ?? "-"}</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}><strong>Match confidence:</strong> {formatPercent(recognition.matchConfidence)}</p>
            {(recognition.matchReason || recognition.unmatchedReason) && (
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{recognition.matchReason ?? recognition.unmatchedReason}</p>
            )}
          </DashboardCard>
        )}

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

        <DashboardCard title="Correct filing decisions">
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            Edit values below and save. These are used for export file naming and folder structure.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 420 }}>
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
              {saving ? "Saving..." : "Save corrections"}
            </button>
          </div>
        </DashboardCard>

        <DashboardCard title="Export preview">
          {exportPreview == null ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Loading...</p>
          ) : exportPreview.needsRouting ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{exportPreview.message ?? "Assign a case to see export path."}</p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>File name:</strong> {exportPreview.fileName ?? "-"}</p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Folder path:</strong> {exportPreview.folderPath ?? "-"}</p>
              {exportPreview.context && (
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                  Based on: {exportPreview.context.documentType}, {exportPreview.context.providerName}, service date {exportPreview.context.serviceDate}
                </p>
              )}
            </>
          )}
        </DashboardCard>

        <DocumentExplainPanel documentId={doc.id} />

        <DashboardCard title="Audit trail">
          {auditTrail.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No audit events yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {auditTrail.slice(0, 12).map((event) => (
                <div key={event.id} style={{ borderBottom: "1px solid var(--onyx-border-subtle)", paddingBottom: "0.75rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span className="onyx-badge onyx-badge-neutral">{formatStatusLabel(event.action)}</span>
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{event.actor}</span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>{formatDateTime(event.createdAt)}</span>
                  </div>
                  {(event.fromCaseId || event.toCaseId) && (
                    <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                      {event.fromCaseId && (
                        <>
                          From <Link href={`/dashboard/cases/${event.fromCaseId}`} className="onyx-link">case</Link>
                        </>
                      )}
                      {event.fromCaseId && event.toCaseId ? <span> · </span> : null}
                      {event.toCaseId && (
                        <>
                          To <Link href={`/dashboard/cases/${event.toCaseId}`} className="onyx-link">case</Link>
                        </>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
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
              {recognition.textExcerpt.length > 10000 ? recognition.textExcerpt.slice(0, 10000) + "\n\n... (truncated)" : recognition.textExcerpt}
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
                    <td style={{ padding: "0.25rem 0.5rem" }}>{line.providerName ?? "-"}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{line.serviceDate ? new Date(line.serviceDate).toLocaleDateString() : "-"}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{(line.cptCode || line.procedureDescription) ? [line.cptCode, line.procedureDescription].filter(Boolean).join(" · ") : "-"}</td>
                    <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{line.amountCharged != null ? `$${Number(line.amountCharged).toLocaleString()}` : "-"}</td>
                    <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{line.amountPaid != null ? `$${Number(line.amountPaid).toLocaleString()}` : "-"}</td>
                    <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{line.balance != null ? `$${Number(line.balance).toLocaleString()}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DashboardCard>
        )}

        {timelineEvents.length > 0 && (
          <DashboardCard title="Timeline events (from this document)">
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
              {timelineEvents.map((ev) => (
                <li key={ev.id} style={{ marginBottom: "0.25rem" }}>
                  <strong>{ev.eventDate ? new Date(ev.eventDate).toLocaleDateString() : "-"}</strong>
                  {" "}{ev.eventType ?? "-"}
                  {ev.track && <span style={{ color: "var(--onyx-text-muted)", marginLeft: "0.25rem" }}>({ev.track})</span>}
                  {ev.provider && <span style={{ marginLeft: "0.25rem" }}>{" - "}{ev.provider}</span>}
                  {ev.diagnosis && <span style={{ marginLeft: "0.25rem" }}>{" - "}{ev.diagnosis}</span>}
                  {ev.procedure && <span style={{ marginLeft: "0.25rem" }}>{" - "}{ev.procedure}</span>}
                  {ev.amount && <span style={{ marginLeft: "0.25rem" }}>{" - "}{ev.amount}</span>}
                </li>
              ))}
            </ul>
          </DashboardCard>
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
