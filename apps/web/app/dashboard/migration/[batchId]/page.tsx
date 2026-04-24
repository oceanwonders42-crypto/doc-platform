"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { isTrafficFeatureEnabled } from "@/lib/devFeatures";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

import {
  MigrationBatchStatusBadge,
  getMigrationBatchStatusMeta,
} from "../MigrationBatchStatusBadge";
import type {
  MigrationBatchContactCandidate,
  MigrationBatchDetail,
  MigrationBatchDetailResponse,
  MigrationBatchDocument,
  MigrationBatchMatterCandidate,
} from "../types";

type DownloadingState = "contacts" | "matters" | "handoff" | null;
type MigrationBatchFinalizeResponse = MigrationBatchDetailResponse & {
  markedExportReadyCount?: number;
};

type ContactRow = MigrationBatchContactCandidate & { id: string };
type MatterRow = MigrationBatchMatterCandidate & { id: string };
type DocumentRow = MigrationBatchDocument;

function isMigrationBatchDetailResponse(value: unknown): value is MigrationBatchDetailResponse {
  return typeof value === "object" && value !== null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function formatConfidence(value: number | null): string {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

function parseFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? fallback;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return fallback;
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return text.slice(0, 200);
  }
}

function createClioIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `migration-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(objectUrl);
}

function getBatchHeading(detail: MigrationBatchDetail): string {
  const label = detail.batch.label?.trim();
  return label && label.length > 0 ? label : `Migration batch ${detail.batch.id.slice(-8)}`;
}

function toDisplayLabel(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function getHandoffReadinessMeta(state: MigrationBatchDetail["handoffReadiness"]["state"]) {
  if (state === "PROCESSING") {
    return {
      label: "Processing",
      className: "onyx-badge onyx-badge-info",
    };
  }
  if (state === "READY_FOR_HANDOFF") {
    return {
      label: "Ready for handoff",
      className: "onyx-badge onyx-badge-success",
    };
  }
  if (state === "HANDED_OFF") {
    return {
      label: "Handed off",
      className: "onyx-badge onyx-badge-neutral",
    };
  }
  return {
    label: "Needs review",
    className: "onyx-badge onyx-badge-warning",
  };
}

function getDocumentStatusClassName(status: string): string {
  if (status === "FAILED") return "onyx-badge onyx-badge-error";
  if (status === "NEEDS_REVIEW" || status === "UNMATCHED") return "onyx-badge onyx-badge-warning";
  if (status === "PROCESSING" || status === "RECEIVED") return "onyx-badge onyx-badge-info";
  if (status === "COMPLETE" || status === "APPROVED") return "onyx-badge onyx-badge-success";
  return "onyx-badge onyx-badge-neutral";
}

function createBatchReviewHref(
  batchId: string,
  batchLabel: string,
  returnTo: string,
  documentId?: string
): string {
  if (!batchId) return "/dashboard/review";
  const params = new URLSearchParams();
  params.set("migrationBatchId", batchId);
  if (batchLabel.trim()) params.set("batchLabel", batchLabel.trim());
  if (returnTo.trim()) params.set("returnTo", returnTo.trim());
  if (documentId?.trim()) params.set("documentId", documentId.trim());
  return `/dashboard/review?${params.toString()}`;
}

function documentNeedsBatchReview(
  document: MigrationBatchDocument,
  flaggedDocumentIds: Set<string>
): boolean {
  return (
    flaggedDocumentIds.has(document.id) ||
    document.status === "FAILED" ||
    document.status === "UNMATCHED" ||
    document.status === "NEEDS_REVIEW" ||
    document.reviewState === "IN_REVIEW" ||
    document.routingStatus === "needs_review"
  );
}

export default function MigrationBatchDetailPage() {
  const params = useParams<{ batchId?: string | string[] }>();
  const batchId = Array.isArray(params?.batchId) ? params?.batchId[0] ?? "" : params?.batchId ?? "";

  const [detail, setDetail] = useState<MigrationBatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<DownloadingState>(null);
  const [historyDownloadId, setHistoryDownloadId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [allowReexport, setAllowReexport] = useState(false);
  const [reexportReason, setReexportReason] = useState("operator_override");
  const trafficEnabled = isTrafficFeatureEnabled();

  const loadDetail = useCallback(() => {
    if (!batchId) {
      setError("Missing migration batch id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`${getApiBase()}/migration/batches/${batchId}`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const payload = response as MigrationBatchDetailResponse;
        if (!isMigrationBatchDetailResponse(payload) || !payload.ok || !payload.batch) {
          setError(payload.error ?? "Failed to load migration batch.");
          return;
        }
        setDetail(payload as MigrationBatchDetail);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load migration batch.");
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const contactRows = useMemo<ContactRow[]>(
    () => detail?.contactCandidates.map((item) => ({ ...item, id: item.key })) ?? [],
    [detail]
  );
  const matterRows = useMemo<MatterRow[]>(
    () => detail?.matterCandidates.map((item) => ({ ...item, id: item.key })) ?? [],
    [detail]
  );
  const documentRows = useMemo<DocumentRow[]>(
    () => detail?.documents ?? [],
    [detail]
  );
  const documentsById = useMemo(
    () => new Map(documentRows.map((item) => [item.id, item])),
    [documentRows]
  );
  const flaggedDocumentIdSet = useMemo(
    () => new Set(detail?.reviewFlags.map((flag) => flag.documentId) ?? []),
    [detail]
  );
  const blockedDocumentIdSet = useMemo(
    () =>
      new Set([
        ...(detail?.reviewFlags.map((flag) => flag.documentId) ?? []),
        ...(detail?.failed.map((item) => item.id) ?? []),
      ]),
    [detail]
  );
  const trafficRows = useMemo(
    () => detail?.documents.filter((item) => item.trafficMatter != null) ?? [],
    [detail]
  );
  const batchHeading = detail ? getBatchHeading(detail) : batchId ? `Migration batch ${batchId.slice(-8)}` : "Migration batch";
  const batchReturnHref = batchId ? `/dashboard/migration/${batchId}` : "/dashboard/migration";
  const batchReviewHref = createBatchReviewHref(batchId, batchHeading, batchReturnHref);
  const blockedDocumentCount = blockedDocumentIdSet.size;
  const showBatchReviewActions =
    blockedDocumentCount > 0 ||
    (detail?.failed.length ?? 0) > 0 ||
    detail?.batch.status === "NEEDS_REVIEW" ||
    detail?.batch.status === "FAILED";

  async function handleCsvDownload(kind: "contacts" | "matters") {
    if (!detail) return;
    setDownloading(kind);
    setError(null);
    setMessage(null);

    const endpoint =
      kind === "contacts"
        ? `${getApiBase()}/migration/batches/${detail.batch.id}/exports/clio/contacts.csv`
        : `${getApiBase()}/migration/batches/${detail.batch.id}/exports/clio/matters.csv`;

    try {
      const response = await fetch(endpoint, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            kind === "contacts"
              ? "Failed to download Clio contacts CSV."
              : "Failed to download Clio matters CSV."
          )
        );
        return;
      }

      const blob = await response.blob();
      downloadBlob(
        blob,
        parseFileName(
          response.headers.get("content-disposition"),
          kind === "contacts" ? "clio-contacts.csv" : "clio-matters.csv"
        )
      );
      setMessage(kind === "contacts" ? "Contacts CSV download started." : "Matters CSV download started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleRecordHandoff() {
    if (!detail) return;
    setDownloading("handoff");
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `${getApiBase()}/migration/batches/${detail.batch.id}/exports/clio/handoff`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createClioIdempotencyKey(),
            ...getAuthHeader(),
          },
          ...getFetchOptions(),
          body: JSON.stringify({
            allowReexport,
            ...(allowReexport ? { reexportReason: reexportReason.trim() || "operator_override" } : {}),
          }),
        }
      );

      if (!response.ok) {
        setError(await readErrorMessage(response, "Failed to record Clio handoff."));
        return;
      }

      const blob = await response.blob();
      downloadBlob(
        blob,
        parseFileName(response.headers.get("content-disposition"), "clio-handoff-batch.zip")
      );
      setMessage("Clio handoff recorded and ZIP download started.");
      loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clio handoff failed.");
    } finally {
      setDownloading(null);
    }
  }

  async function handleStoredHandoffDownload(exportId: string, fallbackFileName: string | null) {
    if (!detail) return;
    setHistoryDownloadId(exportId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `${getApiBase()}/migration/batches/${detail.batch.id}/exports/clio/handoff/${exportId}`,
        {
          headers: getAuthHeader(),
          ...getFetchOptions(),
        }
      );
      if (!response.ok) {
        setError(await readErrorMessage(response, "Failed to download the stored Clio handoff archive."));
        return;
      }

      const blob = await response.blob();
      downloadBlob(
        blob,
        parseFileName(
          response.headers.get("content-disposition"),
          fallbackFileName?.trim() || "clio-handoff-batch.zip"
        )
      );
      setMessage("Stored Clio handoff archive download started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download the stored Clio handoff archive.");
    } finally {
      setHistoryDownloadId(null);
    }
  }

  async function handleFinalizeReadyForHandoff() {
    if (!detail) return;
    setFinalizing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `${getApiBase()}/migration/batches/${detail.batch.id}/review/ready-for-handoff`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          ...getFetchOptions(),
          body: JSON.stringify({}),
        }
      );
      const payload = (await parseJsonResponse(response)) as MigrationBatchFinalizeResponse;
      if (!payload.ok || !payload.batch) {
        if (payload.batch) {
          setDetail(payload as MigrationBatchDetail);
        }
        setError(payload.error ?? "Failed to finalize this batch for Clio handoff.");
        return;
      }

      setDetail(payload as MigrationBatchDetail);
      const markedCount = payload.markedExportReadyCount ?? 0;
      setMessage(
        markedCount > 0
          ? `Marked ${markedCount} approved document${markedCount === 1 ? "" : "s"} export-ready for Clio handoff.`
          : "This batch is already ready for Clio handoff."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize this batch for Clio handoff.");
    } finally {
      setFinalizing(false);
    }
  }

  const contactColumns: Column<ContactRow>[] = [
    {
      key: "candidate",
      header: "Contact candidate",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <strong>{row.fullName}</strong>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            DOB: {formatDate(row.dateOfBirth)}
          </span>
        </div>
      ),
    },
    {
      key: "matterTypes",
      header: "Matter types",
      render: (row) => row.matterTypes.join(", ") || "-",
    },
    {
      key: "caseNumbers",
      header: "Case numbers",
      render: (row) => row.caseNumbers.join(", ") || "-",
    },
    {
      key: "confidence",
      header: "Confidence",
      render: (row) => formatConfidence(row.confidence),
    },
    {
      key: "sources",
      header: "Source documents",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <span>{row.sourceDocumentNames.length}</span>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {row.sourceDocumentNames.slice(0, 2).join(", ")}
            {row.sourceDocumentNames.length > 2 ? ` +${row.sourceDocumentNames.length - 2}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "review",
      header: "Review",
      render: (row) => (
        <span className={row.needsReview ? "onyx-badge onyx-badge-warning" : "onyx-badge onyx-badge-success"}>
          {row.needsReview ? "Needs review" : "Ready"}
        </span>
      ),
    },
  ];

  const matterColumns: Column<MatterRow>[] = [
    {
      key: "matter",
      header: "Matter candidate",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <strong>{row.description}</strong>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {row.customNumber}
          </span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <span>{row.matterType}</span>
          {trafficEnabled && row.trafficMatterId && (
            <Link href={`/dashboard/traffic/${row.trafficMatterId}`} className="onyx-link" style={{ fontSize: "0.8rem" }}>
              Traffic-derived
            </Link>
          )}
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      render: (row) => row.clientFullName || "-",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => row.status,
    },
    {
      key: "confidence",
      header: "Confidence",
      render: (row) => formatConfidence(row.confidence),
    },
    {
      key: "exportReady",
      header: "Export",
      render: (row) => (
        <span className={row.exportReady ? "onyx-badge onyx-badge-success" : "onyx-badge onyx-badge-warning"}>
          {row.exportReady ? "Ready" : "Blocked"}
        </span>
      ),
    },
    {
      key: "links",
      header: "",
      render: (row) => (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {row.routedCaseId && (
            <Link href={`/dashboard/cases/${row.routedCaseId}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
              Case
            </Link>
          )}
          {trafficEnabled && row.trafficMatterId && (
            <Link href={`/dashboard/traffic/${row.trafficMatterId}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
              Traffic
            </Link>
          )}
        </div>
      ),
    },
  ];

  const documentColumns: Column<DocumentRow>[] = [
    {
      key: "document",
      header: "Document",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <Link href={`/dashboard/documents/${row.id}`} className="onyx-link" style={{ fontWeight: 600 }}>
            {row.originalName}
          </Link>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {row.pageCount} page{row.pageCount === 1 ? "" : "s"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.25rem" }}>
          <span className={getDocumentStatusClassName(row.status)}>{toDisplayLabel(row.status)}</span>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            Stage: {toDisplayLabel(row.processingStage)}
          </span>
        </div>
      ),
    },
    {
      key: "recognition",
      header: "Recognition",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <span>{row.recognition?.docType ?? "-"}</span>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {row.recognition?.clientName ?? row.trafficMatter?.defendantName ?? "-"}
          </span>
        </div>
      ),
    },
    {
      key: "routing",
      header: "Routing",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          {row.routedCaseId ? (
            <Link href={`/dashboard/cases/${row.routedCaseId}`} className="onyx-link">
              {row.routedCaseNumber ?? row.routedCaseTitle ?? "Open case"}
            </Link>
          ) : (
            <span>-</span>
          )}
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {row.reviewState ? toDisplayLabel(row.reviewState) : "-"}
          </span>
        </div>
      ),
    },
    {
      key: "traffic",
      header: "Traffic",
      render: (row) =>
        trafficEnabled && row.trafficMatter ? (
          <div style={{ display: "grid", gap: "0.2rem" }}>
            <Link href={`/dashboard/traffic/${row.trafficMatter.id}`} className="onyx-link">
              {row.trafficMatter.citationNumber ?? "Traffic matter"}
            </Link>
            <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
              {row.trafficMatter.defendantName ?? row.trafficMatter.status}
            </span>
          </div>
        ) : (
          "-"
        ),
    },
    {
      key: "processed",
      header: "Processed",
      render: (row) => formatDateTime(row.processedAt),
    },
    {
      key: "review",
      header: "Review",
      render: (row) =>
        documentNeedsBatchReview(row, flaggedDocumentIdSet) ? (
          <div style={{ display: "grid", gap: "0.25rem" }}>
            <Link href={createBatchReviewHref(batchId, batchHeading, batchReturnHref, row.id)} className="onyx-link">
              Review this doc
            </Link>
            <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
              {blockedDocumentIdSet.has(row.id) ? "Flagged for export" : "Needs review before export"}
            </span>
          </div>
        ) : (
          <span style={{ color: "var(--onyx-text-muted)" }}>-</span>
        ),
    },
  ];

  if (loading && !detail) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader
          breadcrumbs={[{ label: "Migration Batches", href: "/dashboard/migration" }, { label: "Loading" }]}
          title="Loading migration batch..."
        />
        <DashboardCard>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading batch details...</p>
        </DashboardCard>
      </div>
    );
  }

  if (!detail) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader
          breadcrumbs={[{ label: "Migration Batches", href: "/dashboard/migration" }, { label: "Unavailable" }]}
          title="Migration batch unavailable"
          action={
            <Link href="/dashboard/migration" className="onyx-link">
              Back to migration batches
            </Link>
          }
        />
        <DashboardCard>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error ?? "Migration batch not found."}</p>
        </DashboardCard>
      </div>
    );
  }

  const statusMeta = getMigrationBatchStatusMeta(detail.batch.status);
  const readyForExport = detail.exportSummary.readyForClioExport;
  const handoffReadinessMeta = getHandoffReadinessMeta(detail.handoffReadiness.state);
  const canFinalize = detail.handoffReadiness.canFinalize;
  const canDownloadPackage = detail.handoffReadiness.canDownloadPackage;
  const exportReadyCaseCount = detail.exportSummary.exportReadyCaseIds.length;
  const activeActionLocked = downloading !== null || finalizing || historyDownloadId !== null;
  const showFreshHandoffExports = detail.batch.status === "READY_FOR_EXPORT";
  const availableArchiveCount = detail.handoffHistory.filter((item) => item.archiveAvailable).length;

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Migration Batches", href: "/dashboard/migration" },
          { label: getBatchHeading(detail) },
        ]}
        title={getBatchHeading(detail)}
        description="Track scanned-document processing, review candidate data, and complete Clio handoff from one staff workflow."
        action={
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href="/dashboard/migration" className="onyx-link" style={{ alignSelf: "center" }}>
              Back to batches
            </Link>
            {showBatchReviewActions && (
              <>
                <Link href={`${batchReturnHref}#review-flags`} className="onyx-link" style={{ alignSelf: "center" }}>
                  View flagged docs
                </Link>
                <Link href={batchReviewHref} className="onyx-link" style={{ alignSelf: "center" }}>
                  Open batch review
                </Link>
              </>
            )}
            <button type="button" onClick={loadDetail} className="onyx-btn-secondary" disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
      />

      {(error || message) && (
        <div
          className="onyx-card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
            borderColor: error ? "var(--onyx-error)" : "var(--onyx-success)",
            background: error ? "rgba(239, 68, 68, 0.06)" : "rgba(34, 197, 94, 0.08)",
          }}
        >
          <p
            style={{
              margin: 0,
              color: error ? "var(--onyx-error)" : "var(--onyx-success)",
              fontWeight: 500,
            }}
          >
            {error ?? message}
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <DashboardCard>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Batch status</p>
          <MigrationBatchStatusBadge status={detail.batch.status} style={{ fontSize: "0.85rem" }} />
          <p style={{ margin: "0.45rem 0 0", fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>{statusMeta.label}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Documents</p>
          <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 600 }}>{detail.total}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Routed matters</p>
          <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 600 }}>{detail.exportSummary.routedCaseIds.length}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Export-ready matters</p>
          <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 600 }}>{exportReadyCaseCount}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Review flags</p>
          <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 600 }}>{detail.reviewFlags.length}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Clio handoffs</p>
          <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 600 }}>{detail.handoffHistory.length}</p>
        </DashboardCard>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <DashboardCard title="Batch summary">
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "minmax(120px, 160px) minmax(0, 1fr)",
              rowGap: "0.75rem",
              columnGap: "1rem",
              fontSize: "0.875rem",
            }}
          >
            <dt style={{ color: "var(--onyx-text-muted)" }}>Source</dt>
            <dd style={{ margin: 0 }}>{detail.batch.source}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Created</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(detail.batch.createdAt)}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Completed</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(detail.batch.completedAt)}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Last handoff</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(detail.batch.lastExportedAt)}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Routed case numbers</dt>
            <dd style={{ margin: 0 }}>
              {detail.exportSummary.routedCaseNumbers.length > 0
                ? detail.exportSummary.routedCaseNumbers.join(", ")
                : "-"}
            </dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Export-ready case numbers</dt>
            <dd style={{ margin: 0 }}>
              {detail.exportSummary.exportReadyCaseNumbers.length > 0
                ? detail.exportSummary.exportReadyCaseNumbers.join(", ")
                : "-"}
            </dd>
          </dl>
        </DashboardCard>

        <DashboardCard title="Processing overview">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "1rem",
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem" }}>By status</h3>
              <div style={{ display: "grid", gap: "0.45rem" }}>
                {Object.entries(detail.byStatus).map(([key, count]) => (
                  <div
                    key={key}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}
                  >
                    <span style={{ color: "var(--onyx-text-muted)" }}>{toDisplayLabel(key)}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem" }}>By stage</h3>
              <div style={{ display: "grid", gap: "0.45rem" }}>
                {Object.entries(detail.byStage).map(([key, count]) => (
                  <div
                    key={key}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}
                  >
                    <span style={{ color: "var(--onyx-text-muted)" }}>{toDisplayLabel(key)}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard title="Clio handoff readiness" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "grid", gap: "0.85rem" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <span className={handoffReadinessMeta.className}>{handoffReadinessMeta.label}</span>
            <span
              className={
                showFreshHandoffExports && canDownloadPackage
                  ? "onyx-badge onyx-badge-success"
                  : detail.handoffHistory.length > 0
                    ? "onyx-badge onyx-badge-neutral"
                    : "onyx-badge onyx-badge-warning"
              }
            >
              {showFreshHandoffExports && canDownloadPackage
                ? "Fresh handoff package available"
                : detail.handoffHistory.length > 0
                  ? "Use export history downloads"
                  : "Fresh handoff package blocked"}
            </span>
            <span style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
              Routed cases: {detail.exportSummary.routedCaseIds.length}
            </span>
            <span style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
              Export-ready cases: {exportReadyCaseCount}
            </span>
            <span style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
              Handoffs recorded: {detail.exportSummary.handoffCount}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
            {detail.handoffReadiness.nextAction}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
            }}
          >
            <div className="onyx-card" style={{ padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Issues</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{detail.handoffReadiness.issueCount}</p>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
                {detail.handoffReadiness.blockingIssueCount} blocking, {detail.handoffReadiness.warningIssueCount} warning
              </p>
            </div>
            <div className="onyx-card" style={{ padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Review-ready docs</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{detail.handoffReadiness.approvedDocumentCount}</p>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
                Approved and waiting to finalize
              </p>
            </div>
            <div className="onyx-card" style={{ padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Export-ready docs</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{detail.handoffReadiness.exportReadyDocumentCount}</p>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
                {detail.handoffReadiness.matterExportReadyCount} matter candidate{detail.handoffReadiness.matterExportReadyCount === 1 ? "" : "s"} ready
              </p>
            </div>
            <div className="onyx-card" style={{ padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Candidates needing review</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>
                {detail.handoffReadiness.contactNeedsReviewCount + detail.handoffReadiness.matterNeedsReviewCount}
              </p>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
                {detail.handoffReadiness.contactNeedsReviewCount} contacts, {detail.handoffReadiness.matterNeedsReviewCount} matters
              </p>
            </div>
          </div>

          {detail.exportSummary.blockedReason && (
            <div
              style={{
                display: "grid",
                gap: "0.35rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--onyx-radius-md)",
                border: "1px solid var(--onyx-border-subtle)",
                background: "var(--onyx-surface-subtle)",
              }}
            >
              <strong style={{ fontSize: "0.9rem" }}>Blocked</strong>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
                {detail.exportSummary.blockedReason}
              </p>
            </div>
          )}

          {showBatchReviewActions && (
            <div
              style={{
                display: "grid",
                gap: "0.65rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--onyx-radius-md)",
                border: "1px solid var(--onyx-border-subtle)",
                background: "var(--onyx-surface-subtle)",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                Resolve {blockedDocumentCount} blocked document{blockedDocumentCount === 1 ? "" : "s"} in batch review before Clio export.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <Link href={batchReviewHref} className="onyx-btn-secondary" style={{ textDecoration: "none" }}>
                  Open batch review queue
                </Link>
                <Link href={`${batchReturnHref}#review-flags`} className="onyx-link" style={{ alignSelf: "center" }}>
                  View flagged docs in batch
                </Link>
              </div>
            </div>
          )}

          {canFinalize && (
            <div
              style={{
                display: "grid",
                gap: "0.65rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--onyx-radius-md)",
                border: "1px solid var(--onyx-border-subtle)",
                background: "rgba(34, 197, 94, 0.08)",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                {detail.handoffReadiness.approvedDocumentCount} approved routed document
                {detail.handoffReadiness.approvedDocumentCount === 1 ? "" : "s"} can be finalized for Clio handoff now.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="onyx-btn-primary"
                  disabled={activeActionLocked}
                  onClick={handleFinalizeReadyForHandoff}
                >
                  {finalizing ? "Finalizing..." : "Finalize batch for handoff"}
                </button>
              </div>
            </div>
          )}

          {showFreshHandoffExports ? (
            <>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="onyx-btn-primary"
                  disabled={!canDownloadPackage || activeActionLocked}
                  onClick={handleRecordHandoff}
                >
                  {downloading === "handoff" ? "Preparing package..." : "Download final Clio handoff package"}
                </button>
                <button
                  type="button"
                  className="onyx-btn-secondary"
                  disabled={!readyForExport || activeActionLocked}
                  onClick={() => handleCsvDownload("contacts")}
                >
                  {downloading === "contacts" ? "Preparing..." : "Download Clio contacts CSV"}
                </button>
                <button
                  type="button"
                  className="onyx-btn-secondary"
                  disabled={!readyForExport || activeActionLocked}
                  onClick={() => handleCsvDownload("matters")}
                >
                  {downloading === "matters" ? "Preparing..." : "Download Clio matters CSV"}
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "0.75rem",
                  alignItems: "end",
                }}
              >
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.875rem",
                    color: "var(--onyx-text-muted)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={allowReexport}
                    onChange={(event) => setAllowReexport(event.target.checked)}
                    style={{ accentColor: "var(--onyx-accent)" }}
                  />
                  Allow re-export override
                </label>
                <div>
                  <label
                    htmlFor="migration-reexport-reason"
                    style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}
                  >
                    Re-export reason
                  </label>
                  <input
                    id="migration-reexport-reason"
                    type="text"
                    className="onyx-input"
                    value={reexportReason}
                    disabled={!allowReexport}
                    onChange={(event) => setReexportReason(event.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "0.35rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--onyx-radius-md)",
                border: "1px solid var(--onyx-border-subtle)",
                background: "var(--onyx-surface-subtle)",
              }}
            >
              <strong style={{ fontSize: "0.9rem" }}>Fresh Clio handoff closed</strong>
              <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
                {detail.batch.status === "EXPORTED"
                  ? "This batch already has recorded Clio handoffs. Use Export History below to download the exact archive from each prior handoff."
                  : "A fresh Clio handoff package only appears once this batch reaches READY_FOR_EXPORT."}
              </p>
            </div>
          )}
        </div>
      </DashboardCard>

      <div id="review-flags">
        <DashboardCard title="Review flags" style={{ marginBottom: "1rem" }}>
        {detail.reviewFlags.length === 0 ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
            No review flags are blocking this batch right now.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {detail.reviewFlags.map((flag) => (
              (() => {
                const flaggedDocument = documentsById.get(flag.documentId);
                return (
                  <div
                    key={`${flag.documentId}:${flag.code}`}
                    style={{
                      border: "1px solid var(--onyx-border-subtle)",
                      borderLeft: flag.severity === "error" ? "3px solid var(--onyx-error)" : "3px solid var(--onyx-warning)",
                      borderRadius: "var(--onyx-radius-md)",
                      padding: "0.9rem 1rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                      <div style={{ display: "grid", gap: "0.35rem" }}>
                        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                          <span className={flag.severity === "error" ? "onyx-badge onyx-badge-error" : "onyx-badge onyx-badge-warning"}>
                            {flag.severity === "error" ? "Error" : "Warning"}
                          </span>
                          {flaggedDocument && (
                            <span className={getDocumentStatusClassName(flaggedDocument.status)}>
                              {toDisplayLabel(flaggedDocument.status)}
                            </span>
                          )}
                        </div>
                        <strong>{flaggedDocument?.originalName ?? `Document ${flag.documentId.slice(-8)}`}</strong>
                        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{flag.message}</p>
                        {flaggedDocument && (
                          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                            {flaggedDocument.failureStage ? `${toDisplayLabel(flaggedDocument.failureStage)}: ` : ""}
                            {flaggedDocument.failureReason ?? "Resolve this issue before export."}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", alignItems: "center" }}>
                        <Link
                          href={createBatchReviewHref(detail.batch.id, batchHeading, batchReturnHref, flag.documentId)}
                          className="onyx-link"
                        >
                          Review this document
                        </Link>
                        <Link href={`/dashboard/documents/${flag.documentId}`} className="onyx-link">
                          Open document
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })()
            ))}
          </div>
        )}
        </DashboardCard>
      </div>

      {trafficEnabled && trafficRows.length > 0 && (
        <DashboardCard title="Traffic-derived matter signals" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {trafficRows.map((row) => (
              <div
                key={row.id}
                style={{
                  border: "1px solid var(--onyx-border-subtle)",
                  borderRadius: "var(--onyx-radius-md)",
                  padding: "0.9rem 1rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    <Link href={`/dashboard/documents/${row.id}`} className="onyx-link" style={{ fontWeight: 600 }}>
                      {row.originalName}
                    </Link>
                    <span style={{ fontSize: "0.85rem", color: "var(--onyx-text-muted)" }}>
                      {row.trafficMatter?.defendantName ?? "-"} | Citation {row.trafficMatter?.citationNumber ?? "-"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span className={row.trafficMatter?.reviewRequired ? "onyx-badge onyx-badge-warning" : "onyx-badge onyx-badge-success"}>
                      {row.trafficMatter?.reviewRequired ? "Traffic review required" : "Traffic ready"}
                    </span>
                    {row.trafficMatter && (
                      <Link href={`/dashboard/traffic/${row.trafficMatter.id}`} className="onyx-link">
                        Open traffic matter
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      )}

      <DashboardCard title="Contact candidates" style={{ marginBottom: "1rem" }}>
        <DataTable columns={contactColumns} data={contactRows} emptyMessage="No contact candidates have been extracted yet." />
      </DashboardCard>

      <DashboardCard title="Matter candidates" style={{ marginBottom: "1rem" }}>
        <DataTable columns={matterColumns} data={matterRows} emptyMessage="No matter candidates have been extracted yet." />
      </DashboardCard>

      <DashboardCard title="Documents in batch" style={{ marginBottom: "1rem" }}>
        <DataTable columns={documentColumns} data={documentRows} emptyMessage="No documents were imported into this batch." />
      </DashboardCard>

      {detail.failed.length > 0 && (
        <DashboardCard title="Failed documents" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {detail.failed.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid var(--onyx-border-subtle)",
                  borderRadius: "var(--onyx-radius-md)",
                  padding: "0.9rem 1rem",
                }}
              >
                <p style={{ margin: "0 0 0.25rem", fontWeight: 600 }}>{item.originalName}</p>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  {item.failureStage ? `${toDisplayLabel(item.failureStage)}: ` : ""}
                  {item.failureReason ?? "Processing failed."}
                </p>
                <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", marginTop: "0.65rem" }}>
                  <Link href={createBatchReviewHref(detail.batch.id, batchHeading, batchReturnHref, item.id)} className="onyx-link">
                    Review this document
                  </Link>
                  <Link href={`/dashboard/documents/${item.id}`} className="onyx-link">
                    Open document
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      )}

      <DashboardCard title="Export history" style={{ marginBottom: "1rem" }}>
        <div id="export-history" style={{ display: "grid", gap: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Every recorded Clio handoff stays listed here with its timestamp, archive availability, and included versus skipped case counts.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
            }}
          >
            <div className="onyx-card" style={{ padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Recorded handoffs</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{detail.handoffHistory.length}</p>
            </div>
            <div className="onyx-card" style={{ padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Last export</p>
              <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>{formatDateTime(detail.batch.lastExportedAt)}</p>
            </div>
            <div className="onyx-card" style={{ padding: "0.85rem 1rem" }}>
              <p style={{ margin: "0 0 0.3rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Downloadable archives</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{availableArchiveCount}</p>
            </div>
          </div>
        {detail.handoffHistory.length === 0 ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
            No Clio handoff has been recorded for this migration batch yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {detail.handoffHistory.map((item) => (
              <div
                    key={item.exportId}
                    style={{
                      border: "1px solid var(--onyx-border-subtle)",
                      borderRadius: "var(--onyx-radius-md)",
                      padding: "1rem",
                }}
              >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: "0.25rem" }}>
                      <strong>{item.archiveFileName ?? "Clio handoff ZIP"}</strong>
                      <span className={item.archiveAvailable ? "onyx-badge onyx-badge-success" : "onyx-badge onyx-badge-neutral"} style={{ width: "fit-content" }}>
                        {item.archiveAvailable ? "Archive available" : "Archive unavailable"}
                      </span>
                      <span style={{ fontSize: "0.85rem", color: "var(--onyx-text-muted)" }}>
                        Exported {formatDateTime(item.exportedAt)}
                        {item.actorLabel ? ` by ${item.actorLabel}` : ""}
                      </span>
                    </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span className="onyx-badge onyx-badge-success">
                      Included {item.includedCaseCount}
                    </span>
                    <span className="onyx-badge onyx-badge-warning">
                      Skipped {item.skippedCaseCount}
                    </span>
                    {item.archiveAvailable ? (
                      <button
                        type="button"
                        className="onyx-btn-secondary"
                        disabled={activeActionLocked}
                        onClick={() => handleStoredHandoffDownload(item.exportId, item.archiveFileName)}
                      >
                        {historyDownloadId === item.exportId ? "Downloading..." : "Download"}
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
                        Archive unavailable
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ margin: "0.65rem 0 0", fontSize: "0.85rem", color: "var(--onyx-text-muted)" }}>
                  Contacts file: {item.contactsFileName ?? "-"} | Matters file: {item.mattersFileName ?? "-"}
                </p>
              </div>
            ))}
          </div>
        )}
        </div>
      </DashboardCard>
    </div>
  );
}
