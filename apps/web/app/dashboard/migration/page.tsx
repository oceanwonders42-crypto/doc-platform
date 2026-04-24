"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

import {
  MigrationBatchStatusBadge,
  isMigrationBatchExportReady,
} from "./MigrationBatchStatusBadge";
import type {
  MigrationBatchImportFailure,
  MigrationBatchImportResponse,
  MigrationBatchListItem,
  MigrationBatchesResponse,
} from "./types";

type CreatedBatchNotice = {
  batchId: string;
  importedCount: number;
  failedCount: number;
  failures: MigrationBatchImportFailure[];
};

type MigrationQuickFilter =
  | "all"
  | "processing"
  | "needs_review"
  | "needs_attention"
  | "ready_for_export"
  | "exported"
  | "recently_reviewed"
  | "stale_processing";
type MigrationSortOption =
  | "newest_created"
  | "oldest_created"
  | "most_unresolved"
  | "recently_reviewed";

const RECENTLY_REVIEWED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_REFRESH_INTERVAL_MS = 15 * 1000;
const STALE_PROCESSING_THRESHOLD_MS = 60 * 60 * 1000;

function isMigrationBatchesResponse(value: unknown): value is MigrationBatchesResponse {
  return typeof value === "object" && value !== null;
}

function isMigrationBatchImportResponse(value: unknown): value is MigrationBatchImportResponse {
  return typeof value === "object" && value !== null;
}

function getBatchLabel(item: { id: string; label: string | null }): string {
  const trimmed = item.label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Batch ${item.id.slice(-8)}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function getUnresolvedReviewCount(item: MigrationBatchListItem): number {
  return item.unresolvedReviewCount ?? item.needsReviewCount ?? 0;
}

function batchNeedsAttention(item: MigrationBatchListItem): boolean {
  return getUnresolvedReviewCount(item) > 0 || item.status === "FAILED";
}

function getTimestamp(value: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isRecentlyReviewed(item: MigrationBatchListItem): boolean {
  const lastReviewedAt = getTimestamp(item.lastReviewedAt);
  if (!lastReviewedAt) return false;
  return Date.now() - lastReviewedAt <= RECENTLY_REVIEWED_WINDOW_MS;
}

function getExportReadinessLabel(item: MigrationBatchListItem): string {
  if (item.status === "EXPORTED") return "Exported";
  if (isMigrationBatchExportReady(item.status)) return "Ready";
  if (getUnresolvedReviewCount(item) > 0) return "Blocked by review";
  if (item.routedCaseCount === 0) return "Needs routing";
  if (item.status === "PROCESSING") return "Processing";
  if (item.status === "FAILED") return "Failed";
  return "Not ready";
}

function getExportReadinessClassName(item: MigrationBatchListItem): string {
  if (item.status === "EXPORTED") return "onyx-badge onyx-badge-success";
  if (isMigrationBatchExportReady(item.status)) return "onyx-badge onyx-badge-success";
  if (getUnresolvedReviewCount(item) > 0) return "onyx-badge onyx-badge-warning";
  if (item.status === "FAILED") return "onyx-badge onyx-badge-error";
  return "onyx-badge onyx-badge-neutral";
}

function getBatchDetailHref(batchId: string): string {
  return `/dashboard/migration/${batchId}`;
}

function getBatchReviewHref(item: MigrationBatchListItem): string {
  const params = new URLSearchParams();
  params.set("migrationBatchId", item.id);
  params.set("batchLabel", getBatchLabel(item));
  params.set("returnTo", getBatchDetailHref(item.id));
  return `/dashboard/review?${params.toString()}`;
}

function getProcessedDocumentCount(item: MigrationBatchListItem): number {
  return Math.max(0, Math.min(item.totalDocuments, item.processedDocuments ?? 0));
}

function getRemainingDocumentCount(item: MigrationBatchListItem): number {
  return Math.max(0, item.remainingDocuments ?? item.totalDocuments - getProcessedDocumentCount(item));
}

function shouldShowProgressSummary(item: MigrationBatchListItem): boolean {
  return item.status === "PROCESSING" && item.totalDocuments > 0;
}

function getProcessingAgeMs(item: MigrationBatchListItem): number {
  if (item.status !== "PROCESSING") return 0;
  return Math.max(0, Date.now() - getTimestamp(item.createdAt));
}

function formatProcessingAge(item: MigrationBatchListItem): string {
  const ageMs = getProcessingAgeMs(item);
  if (ageMs < 60 * 1000) return "under 1 min";

  const totalMinutes = Math.floor(ageMs / (60 * 1000));
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;
  return `${hours} hr ${minutes} min`;
}

function isStaleProcessingBatch(item: MigrationBatchListItem): boolean {
  return item.status === "PROCESSING" && getProcessingAgeMs(item) >= STALE_PROCESSING_THRESHOLD_MS;
}

function isProcessingBatch(item: MigrationBatchListItem): boolean {
  return item.status === "PROCESSING";
}

function isNeedsReviewBatch(item: MigrationBatchListItem): boolean {
  return item.status === "NEEDS_REVIEW";
}

function isReadyForExportBatch(item: MigrationBatchListItem): boolean {
  return item.status === "READY_FOR_EXPORT";
}

function isExportedBatch(item: MigrationBatchListItem): boolean {
  return item.status === "EXPORTED";
}

function getPrimaryBatchAction(item: MigrationBatchListItem): { href: string; label: string } {
  if (isNeedsReviewBatch(item)) {
    return {
      href: getBatchReviewHref(item),
      label: "Open batch review",
    };
  }

  if (isStaleProcessingBatch(item)) {
    if (batchNeedsAttention(item)) {
      return {
        href: getBatchReviewHref(item),
        label: "Review stale batch",
      };
    }
    return {
      href: getBatchDetailHref(item.id),
      label: "Inspect stale batch",
    };
  }

  if (isProcessingBatch(item)) {
    return {
      href: getBatchDetailHref(item.id),
      label: "Track processing",
    };
  }

  if (batchNeedsAttention(item)) {
    return {
      href: getBatchReviewHref(item),
      label: "Open batch review",
    };
  }

  if (isReadyForExportBatch(item)) {
    return {
      href: getBatchDetailHref(item.id),
      label: "Open Clio handoff",
    };
  }

  if (isExportedBatch(item)) {
    return {
      href: `${getBatchDetailHref(item.id)}#export-history`,
      label: "View export history",
    };
  }

  return {
    href: getBatchDetailHref(item.id),
    label: "Open batch",
  };
}

export default function MigrationBatchesPage() {
  const [items, setItems] = useState<MigrationBatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<MigrationQuickFilter>("all");
  const [sortBy, setSortBy] = useState<MigrationSortOption>("newest_created");
  const [label, setLabel] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [createdBatch, setCreatedBatch] = useState<CreatedBatchNotice | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);

  const loadBatches = useCallback(async (options?: { background?: boolean; silentError?: boolean }) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    const background = options?.background ?? false;
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch(`${getApiBase()}/migration/batches`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const payload = await parseJsonResponse(response);
      if (
        !isMigrationBatchesResponse(payload) ||
        !payload.ok ||
        !Array.isArray(payload.items)
      ) {
        if (!options?.silentError) {
          setError("Failed to load migration batches.");
        }
        return;
      }

      setItems(payload.items);
      setLastUpdatedAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      if (!options?.silentError) {
        setError(err instanceof Error ? err.message : "Failed to load migration batches.");
      }
    } finally {
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const hasProcessingBatches = useMemo(
    () => items.some((item) => item.status === "PROCESSING"),
    [items]
  );

  useEffect(() => {
    if (!hasProcessingBatches) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadBatches({ background: true, silentError: true });
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [hasProcessingBatches, loadBatches]);

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.documents += item.totalDocuments;
        if (isProcessingBatch(item)) acc.processing += 1;
        if (isNeedsReviewBatch(item)) acc.needsReviewBatches += 1;
        if (batchNeedsAttention(item)) acc.needsAttentionBatches += 1;
        acc.unresolvedReviews += getUnresolvedReviewCount(item);
        if (isReadyForExportBatch(item)) acc.ready += 1;
        if (isExportedBatch(item)) acc.exported += 1;
        return acc;
      },
      {
        total: 0,
        documents: 0,
        processing: 0,
        needsReviewBatches: 0,
        needsAttentionBatches: 0,
        unresolvedReviews: 0,
        ready: 0,
        exported: 0,
      }
    );
  }, [items]);

  const quickFilterCounts = useMemo(
    () => ({
      all: items.length,
      processing: items.filter(isProcessingBatch).length,
      needs_review: items.filter(isNeedsReviewBatch).length,
      needs_attention: items.filter(batchNeedsAttention).length,
      ready_for_export: items.filter(isReadyForExportBatch).length,
      exported: items.filter(isExportedBatch).length,
      recently_reviewed: items.filter(isRecentlyReviewed).length,
      stale_processing: items.filter(isStaleProcessingBatch).length,
    }),
    [items]
  );

  const filteredItems = useMemo(() => {
    const visibleItems = items.filter((item) => {
      if (quickFilter === "processing") return isProcessingBatch(item);
      if (quickFilter === "needs_review") return isNeedsReviewBatch(item);
      if (quickFilter === "needs_attention") return batchNeedsAttention(item);
      if (quickFilter === "ready_for_export") return isReadyForExportBatch(item);
      if (quickFilter === "exported") return isExportedBatch(item);
      if (quickFilter === "recently_reviewed") return isRecentlyReviewed(item);
      if (quickFilter === "stale_processing") return isStaleProcessingBatch(item);
      return true;
    });

    const sortedItems = [...visibleItems].sort((left, right) => {
      if (sortBy === "oldest_created") {
        return getTimestamp(left.createdAt) - getTimestamp(right.createdAt);
      }
      if (sortBy === "most_unresolved") {
        const unresolvedDelta = getUnresolvedReviewCount(right) - getUnresolvedReviewCount(left);
        if (unresolvedDelta !== 0) return unresolvedDelta;
        return getTimestamp(right.createdAt) - getTimestamp(left.createdAt);
      }
      if (sortBy === "recently_reviewed") {
        const reviewDelta = getTimestamp(right.lastReviewedAt) - getTimestamp(left.lastReviewedAt);
        if (reviewDelta !== 0) return reviewDelta;
        return getTimestamp(right.createdAt) - getTimestamp(left.createdAt);
      }
      return getTimestamp(right.createdAt) - getTimestamp(left.createdAt);
    });

    return sortedItems;
  }, [items, quickFilter, sortBy]);

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFiles.length === 0) {
      setUploadError("Select at least one scanned file to import.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setCreatedBatch(null);

    const formData = new FormData();
    if (label.trim()) formData.set("label", label.trim());
    selectedFiles.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch(`${getApiBase()}/migration/import`, {
        method: "POST",
        headers: getAuthHeader(),
        ...getFetchOptions(),
        body: formData,
      });
      const data = await parseJsonResponse(response);
      const payload = data as MigrationBatchImportResponse;

      if (!response.ok || !isMigrationBatchImportResponse(payload) || !payload.ok || !payload.batchId) {
        setUploadError(payload.error ?? "Batch import failed.");
        return;
      }

      setCreatedBatch({
        batchId: payload.batchId,
        importedCount: payload.importedCount ?? 0,
        failedCount: payload.failedCount ?? 0,
        failures: payload.failures ?? [],
      });
      setLabel("");
      setSelectedFiles([]);
      setFileInputKey((current) => current + 1);
      void loadBatches({ background: items.length > 0 });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Batch import failed.");
    } finally {
      setUploading(false);
    }
  }

  const columns: Column<MigrationBatchListItem>[] = [
    {
      key: "label",
      header: "Batch",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <Link href={`/dashboard/migration/${row.id}`} className="onyx-link" style={{ fontWeight: 600 }}>
            {getBatchLabel(row)}
          </Link>
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>{row.id}</span>
            {batchNeedsAttention(row) && (
              <span className="onyx-badge onyx-badge-warning" style={{ fontSize: "0.7rem" }}>
                Needs attention
              </span>
            )}
            {isStaleProcessingBatch(row) && (
              <span
                className="onyx-badge onyx-badge-warning"
                style={{ fontSize: "0.7rem" }}
                title="Stale: still processing after at least 1 hour."
              >
                Possibly stale
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <MigrationBatchStatusBadge status={row.status} />,
    },
    {
      key: "createdAt",
      header: "Created",
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "docCounts",
      header: "Documents",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <strong>{row.totalDocuments}</strong>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {row.routedCaseCount} routed
          </span>
          {shouldShowProgressSummary(row) && (
            <>
              <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
                {getProcessedDocumentCount(row)} processed
              </span>
              <span className="onyx-badge onyx-badge-info" style={{ width: "fit-content" }}>
                {getRemainingDocumentCount(row)} in flight
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
                Processing for {formatProcessingAge(row)}
              </span>
            </>
          )}
        </div>
      ),
    },
    {
      key: "review",
      header: "Unresolved review",
      render: (row) => {
        const unresolvedCount = getUnresolvedReviewCount(row);
        return (
          <div style={{ display: "grid", gap: "0.2rem" }}>
            <strong>{unresolvedCount}</strong>
            <span className={unresolvedCount > 0 ? "onyx-badge onyx-badge-warning" : "onyx-badge onyx-badge-success"}>
              {unresolvedCount > 0 ? "Needs attention" : "Clear"}
            </span>
          </div>
        );
      },
    },
    {
      key: "lastReviewed",
      header: "Last reviewed",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <span>{formatDateTime(row.lastReviewedAt)}</span>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {row.lastReviewedAt ? "Latest staff review touch" : "No review activity yet"}
          </span>
        </div>
      ),
    },
    {
      key: "readiness",
      header: "Export readiness",
      render: (row) => (
        <span className={getExportReadinessClassName(row)}>
          {getExportReadinessLabel(row)}
        </span>
      ),
    },
    {
      key: "handoffs",
      header: "Handoffs",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <strong>{row.handoffCount}</strong>
          <span style={{ fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {formatDateTime(row.lastExportedAt)}
          </span>
        </div>
      ),
    },
    {
      key: "action",
      header: "",
      render: (row) => {
        const action = getPrimaryBatchAction(row);
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", justifyContent: "flex-end" }}>
            <Link href={action.href} className="onyx-link" style={{ fontSize: "0.875rem" }}>
              {action.label}
            </Link>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Migration Batches" }]}
        title="Migration batches"
        description="Import scanned backfile documents, track processing, and move export-ready batches into Clio."
        action={
          <button
            type="button"
            onClick={() => void loadBatches({ background: items.length > 0 })}
            className="onyx-btn-secondary"
            disabled={loading || refreshing}
          >
            {loading || refreshing ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <DashboardCard>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Batches</p>
          <p style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600 }}>{summary.total}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Documents</p>
          <p style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600 }}>{summary.documents}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Processing</p>
          <p style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600 }}>{summary.processing}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Needs review</p>
          <p style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600 }}>{summary.needsReviewBatches}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Ready for export</p>
          <p style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600, color: "var(--onyx-success)" }}>{summary.ready}</p>
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Exported</p>
          <p style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600 }}>{summary.exported}</p>
        </DashboardCard>
        <DashboardCard
          style={
            quickFilterCounts.stale_processing > 0
              ? {
                  borderColor: "var(--onyx-warning)",
                  background: "rgba(245, 158, 11, 0.08)",
                }
              : undefined
          }
        >
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Stale batches</p>
          <p
            style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600 }}
            title="Stale means PROCESSING for at least 1 hour."
          >
            {quickFilterCounts.stale_processing}
          </p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {quickFilterCounts.stale_processing > 0
              ? "Processing for at least 1 hour."
              : "No stale processing batches right now."}
          </p>
          {quickFilterCounts.stale_processing > 0 && (
            <button
              type="button"
              className="onyx-link"
              onClick={() => setQuickFilter("stale_processing")}
              style={{
                marginTop: "0.55rem",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontSize: "0.875rem",
              }}
            >
              Show stale batches
            </button>
          )}
        </DashboardCard>
        <DashboardCard>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Needs attention</p>
          <p style={{ margin: 0, fontSize: "1.35rem", fontWeight: 600 }}>{summary.needsAttentionBatches}</p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
            {summary.unresolvedReviews} unresolved review doc{summary.unresolvedReviews === 1 ? "" : "s"}
          </p>
        </DashboardCard>
      </div>

      {createdBatch && (
        <div
          className="onyx-card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
            borderColor: "var(--onyx-success)",
            background: "rgba(34, 197, 94, 0.08)",
          }}
        >
          <p style={{ margin: 0, color: "var(--onyx-success)", fontWeight: 600 }}>
            Imported {createdBatch.importedCount} file{createdBatch.importedCount === 1 ? "" : "s"} into a new migration batch.
          </p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Failed files: {createdBatch.failedCount}
          </p>
          <Link
            href={`/dashboard/migration/${createdBatch.batchId}`}
            className="onyx-link"
            style={{ display: "inline-block", marginTop: "0.65rem" }}
          >
            Open created batch
          </Link>
          {createdBatch.failures.length > 0 && (
            <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.15rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              {createdBatch.failures.map((failure) => (
                <li key={`${failure.originalName}:${failure.error}`}>
                  {failure.originalName}: {failure.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(error || uploadError) && (
        <div
          className="onyx-card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
            borderColor: "var(--onyx-error)",
            background: "rgba(239, 68, 68, 0.06)",
          }}
        >
          <p style={{ margin: 0, color: "var(--onyx-error)", fontWeight: 500 }}>
            {uploadError ?? error}
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <DashboardCard title="Import scanned batch">
          <form onSubmit={handleImport} style={{ display: "grid", gap: "1rem" }}>
            <div>
              <label
                htmlFor="migration-label"
                style={{ display: "block", marginBottom: "0.375rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}
              >
                Batch label
              </label>
              <input
                id="migration-label"
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="onyx-input"
                placeholder="Backfile March intake"
                disabled={uploading}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label
                htmlFor="migration-files"
                style={{ display: "block", marginBottom: "0.375rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}
              >
                Scanned files
              </label>
              <input
                key={fileInputKey}
                id="migration-files"
                type="file"
                multiple
                accept=".pdf,.tif,.tiff,.jpg,.jpeg,image/*,application/pdf"
                onChange={(event) => {
                  setSelectedFiles(Array.from(event.target.files ?? []));
                  setUploadError(null);
                }}
                disabled={uploading}
                className="onyx-input"
                style={{ width: "100%", padding: "0.45rem 0.75rem" }}
              />
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                {selectedFiles.length === 0
                  ? "Choose one or more scanned PDFs or image files."
                  : `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected.`}
              </p>
              {selectedFiles.length > 0 && (
                <ul style={{ margin: "0.65rem 0 0", paddingLeft: "1rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                  {selectedFiles.slice(0, 5).map((file) => (
                    <li key={`${file.name}:${file.size}`}>{file.name}</li>
                  ))}
                  {selectedFiles.length > 5 && <li>+{selectedFiles.length - 5} more files</li>}
                </ul>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="submit" className="onyx-btn-primary" disabled={uploading || selectedFiles.length === 0}>
                {uploading ? "Uploading..." : "Create migration batch"}
              </button>
              <button
                type="button"
                className="onyx-btn-secondary"
                disabled={uploading || (selectedFiles.length === 0 && !label)}
                onClick={() => {
                  setLabel("");
                  setSelectedFiles([]);
                  setFileInputKey((current) => current + 1);
                  setUploadError(null);
                }}
              >
                Clear
              </button>
            </div>
          </form>
        </DashboardCard>

        <DashboardCard title="Batches">
          {loading ? (
            <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading migration batches...</p>
          ) : items.length === 0 ? (
            <div style={{ padding: "1rem 0" }}>
              <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500 }}>No migration batches yet</p>
              <p style={{ margin: "0.45rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
                Upload a scanned backfile batch to start the paper-to-paperless workflow.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              <div
                className="onyx-card"
                style={{
                  padding: "0.85rem 1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: 500 }}>
                    {refreshing ? "Refreshing migration batches..." : "Migration batch list is current"}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                    Last updated: {formatDateTime(lastUpdatedAt)}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span
                    className={hasProcessingBatches ? "onyx-badge onyx-badge-info" : "onyx-badge onyx-badge-neutral"}
                  >
                    {hasProcessingBatches
                      ? `Auto-refresh on (${Math.round(AUTO_REFRESH_INTERVAL_MS / 1000)}s)`
                      : "Auto-refresh idle"}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                    {hasProcessingBatches
                      ? "Processing batches refresh automatically while this page is open."
                      : "Auto-refresh stays quiet when all batches are stable."}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Quick filters</p>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={quickFilter === "all" ? "onyx-btn-primary" : "onyx-btn-secondary"}
                      onClick={() => setQuickFilter("all")}
                    >
                      All ({quickFilterCounts.all})
                    </button>
                    <button
                      type="button"
                      className={quickFilter === "processing" ? "onyx-btn-primary" : "onyx-btn-secondary"}
                      onClick={() => setQuickFilter("processing")}
                    >
                      Processing ({quickFilterCounts.processing})
                    </button>
                    <button
                      type="button"
                      className={quickFilter === "needs_review" ? "onyx-btn-primary" : "onyx-btn-secondary"}
                      onClick={() => setQuickFilter("needs_review")}
                    >
                      Needs review ({quickFilterCounts.needs_review})
                    </button>
                    <button
                      type="button"
                      className={quickFilter === "needs_attention" ? "onyx-btn-primary" : "onyx-btn-secondary"}
                      onClick={() => setQuickFilter("needs_attention")}
                    >
                      Needs attention ({quickFilterCounts.needs_attention})
                    </button>
                    <button
                      type="button"
                      className={quickFilter === "ready_for_export" ? "onyx-btn-primary" : "onyx-btn-secondary"}
                      onClick={() => setQuickFilter("ready_for_export")}
                    >
                      Ready for export ({quickFilterCounts.ready_for_export})
                    </button>
                    <button
                      type="button"
                      className={quickFilter === "exported" ? "onyx-btn-primary" : "onyx-btn-secondary"}
                      onClick={() => setQuickFilter("exported")}
                    >
                      Exported ({quickFilterCounts.exported})
                    </button>
                    <button
                      type="button"
                      className={quickFilter === "recently_reviewed" ? "onyx-btn-primary" : "onyx-btn-secondary"}
                      onClick={() => setQuickFilter("recently_reviewed")}
                    >
                      Recently reviewed (7d) ({quickFilterCounts.recently_reviewed})
                    </button>
                    <button
                      type="button"
                      className={quickFilter === "stale_processing" ? "onyx-btn-primary" : "onyx-btn-secondary"}
                      onClick={() => setQuickFilter("stale_processing")}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                        <span>Stale processing</span>
                        {quickFilterCounts.stale_processing > 0 && (
                          <span
                            className="onyx-badge onyx-badge-warning"
                            style={{ fontSize: "0.75rem" }}
                            title="Stale means PROCESSING for at least 1 hour."
                          >
                            {quickFilterCounts.stale_processing}
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "0.5rem", minWidth: "220px" }}>
                  <label
                    htmlFor="migration-sort"
                    style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}
                  >
                    Sort by
                  </label>
                  <select
                    id="migration-sort"
                    className="onyx-input"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as MigrationSortOption)}
                    style={{ width: "100%" }}
                  >
                    <option value="newest_created">Newest created</option>
                    <option value="oldest_created">Oldest created</option>
                    <option value="most_unresolved">Most unresolved review items</option>
                    <option value="recently_reviewed">Most recently reviewed</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  Showing {filteredItems.length} of {items.length} batch{items.length === 1 ? "" : "es"}.
                </p>
                {quickFilter !== "all" && (
                  <button
                    type="button"
                    className="onyx-link"
                    onClick={() => setQuickFilter("all")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {quickFilter === "stale_processing" && (
                <div
                  className="onyx-card"
                  style={{
                    padding: "0.85rem 1rem",
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                    borderColor: "var(--onyx-warning)",
                    background: "rgba(245, 158, 11, 0.08)",
                  }}
                  title="Stale means PROCESSING for at least 1 hour."
                >
                  <span className="onyx-badge onyx-badge-warning" style={{ fontSize: "0.8rem" }}>
                    Stale processing view
                  </span>
                  <span style={{ fontSize: "0.875rem", color: "var(--onyx-text)" }}>
                    Showing batches still processing for at least 1 hour.
                  </span>
                  <button
                    type="button"
                    className="onyx-link"
                    onClick={() => setQuickFilter("all")}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Back to all batches
                  </button>
                </div>
              )}

              <div style={{ overflow: "hidden" }}>
                <DataTable
                  columns={columns}
                  data={filteredItems}
                  emptyMessage="No migration batches match the current triage filter."
                />
              </div>
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
