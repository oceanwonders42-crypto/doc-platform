"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type { MigrationBatchListItem, MigrationBatchesResponse } from "../migration/types";

type ExportAction = {
  id: "contacts" | "matters";
  title: string;
  description: string;
  endpoint: string;
  defaultFileName: string;
};

type DownloadingState = ExportAction["id"] | "batch" | null;

type BatchExportCandidate = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
  createdAt: string;
  clioHandoff?: {
    alreadyExported: boolean;
    exportCount: number;
    lastExportedAt: string | null;
    lastExportType: "single_case" | "batch" | null;
    lastExportSubtype: "contacts" | "matters" | "combined_batch" | null;
    lastExportWasReExport?: boolean;
    lastActorLabel: string | null;
  };
  clioBatchExport?: {
    status: "eligible" | "already_exported" | "potentially_skipped";
    reason: string;
  };
};

type CasesListResponse = {
  ok?: boolean;
  items?: BatchExportCandidate[];
};

type ClioHandoffHistoryItem = {
  exportId: string;
  exportedAt: string;
  exportType: "single_case" | "batch";
  exportSubtype: "contacts" | "matters" | "combined_batch";
  actorLabel: string | null;
  actorType: string | null;
  actorRole: string | null;
  archiveFileName: string | null;
  contactsFileName: string | null;
  mattersFileName: string | null;
  manifestFileName: string | null;
  contactsRowCount: number | null;
  mattersRowCount: number | null;
  reExportOverride: boolean;
  reExportReason: string | null;
  includedCases: Array<{
    caseId: string;
    caseNumber: string | null;
    caseTitle: string | null;
    clientName: string | null;
    isReExport: boolean;
  }>;
  skippedCases: Array<{
    caseId: string;
    caseNumber: string | null;
    caseTitle: string | null;
    clientName: string | null;
    reason: string;
  }>;
};

type ClioHandoffHistoryResponse = {
  ok?: boolean;
  items?: ClioHandoffHistoryItem[];
};

function getBatchLabel(item: { id: string; label: string | null }): string {
  const trimmed = item.label?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Batch ${item.id.slice(-8)}`;
}

function isMigrationBatchReady(item: MigrationBatchListItem): boolean {
  return item.status === "READY_FOR_EXPORT" || item.status === "EXPORTED";
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

const EXPORT_ACTIONS: ExportAction[] = [
  {
    id: "contacts",
    title: "Contacts CSV",
    description: "Exports firm-level client contact rows for Clio Manage import.",
    endpoint: "/exports/clio/contacts.csv",
    defaultFileName: "clio-contacts.csv",
  },
  {
    id: "matters",
    title: "Matters CSV",
    description: "Exports firm-level matter rows derived from case number, title, and client data.",
    endpoint: "/exports/clio/matters.csv",
    defaultFileName: "clio-matters.csv",
  },
];

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

function compareCasesForBatchExport(a: BatchExportCandidate, b: BatchExportCandidate): number {
  const aCaseNumber = a.caseNumber?.trim() ?? "";
  const bCaseNumber = b.caseNumber?.trim() ?? "";

  if (aCaseNumber && bCaseNumber) {
    const caseNumberCompare = aCaseNumber.localeCompare(bCaseNumber, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (caseNumberCompare !== 0) return caseNumberCompare;
  } else if (aCaseNumber) {
    return -1;
  } else if (bCaseNumber) {
    return 1;
  }

  const createdAtCompare = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (createdAtCompare !== 0) return createdAtCompare;

  return a.id.localeCompare(b.id);
}

function formatCanonicalExportDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatCanonicalExportTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const iso = parsed.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function createClioIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `clio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ExportsPage() {
  const [downloading, setDownloading] = useState<DownloadingState>(null);
  const [cases, setCases] = useState<BatchExportCandidate[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [batchSearch, setBatchSearch] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [includeReexports, setIncludeReexports] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<ClioHandoffHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [migrationBatches, setMigrationBatches] = useState<MigrationBatchListItem[]>([]);
  const [migrationBatchesLoading, setMigrationBatchesLoading] = useState(true);
  const [migrationBatchesError, setMigrationBatchesError] = useState<string | null>(null);

  const loadCases = useCallback(() => {
    setCasesLoading(true);
    setCasesError(null);
    fetch(`${getApiBase()}/cases`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const data = response as CasesListResponse;
        if (!data.ok || !Array.isArray(data.items)) {
          setCasesError("Failed to load cases for batch export.");
          return;
        }
        const sortedCases = [...data.items].sort(compareCasesForBatchExport);
        setCases(sortedCases);
        setSelectedCaseIds((current) => current.filter((caseId) => sortedCases.some((item) => item.id === caseId)));
      })
      .catch((err) => {
        setCasesError(err instanceof Error ? err.message : "Failed to load cases for batch export.");
      })
      .finally(() => setCasesLoading(false));
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    fetch(`${getApiBase()}/cases/exports/clio/history?limit=12`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const data = response as ClioHandoffHistoryResponse;
        if (!data.ok || !Array.isArray(data.items)) {
          setHistoryError("Failed to load Clio handoff history.");
          return;
        }
        setHistory(data.items);
      })
      .catch((err) => {
        setHistoryError(err instanceof Error ? err.message : "Failed to load Clio handoff history.");
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const loadMigrationBatches = useCallback(() => {
    setMigrationBatchesLoading(true);
    setMigrationBatchesError(null);
    fetch(`${getApiBase()}/migration/batches`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const data = response as MigrationBatchesResponse;
        if (!data.ok || !Array.isArray(data.items)) {
          setMigrationBatchesError("Failed to load migration batches.");
          return;
        }
        setMigrationBatches(data.items);
      })
      .catch((err) => {
        setMigrationBatchesError(err instanceof Error ? err.message : "Failed to load migration batches.");
      })
      .finally(() => setMigrationBatchesLoading(false));
  }, []);

  useEffect(() => {
    loadMigrationBatches();
  }, [loadMigrationBatches]);

  async function handleDownload(action: ExportAction) {
    setDownloading(action.id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${getApiBase()}${action.endpoint}`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, `Failed to download ${action.title.toLowerCase()}.`));
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = parseFileName(response.headers.get("content-disposition"), action.defaultFileName);
      anchor.click();
      window.URL.revokeObjectURL(downloadUrl);
      setSuccess(`${action.title} download started.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setDownloading(null);
    }
  }

  const filteredCases = useMemo(() => {
    const search = batchSearch.trim().toLowerCase();
    if (!search) return cases;
    return cases.filter((item) => {
      const haystack = [item.clientName, item.caseNumber, item.title].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(search);
    });
  }, [batchSearch, cases]);

  const selectedCases = useMemo(
    () => cases.filter((item) => selectedCaseIds.includes(item.id)),
    [cases, selectedCaseIds]
  );

  useEffect(() => {
    if (includeReexports) return;
    setSelectedCaseIds((current) =>
      current.filter((caseId) => {
        const item = cases.find((candidate) => candidate.id === caseId);
        return item?.clioBatchExport?.status !== "already_exported";
      })
    );
  }, [cases, includeReexports]);

  const eligibleSelectedCount = selectedCases.filter((item) => item.clioBatchExport?.status === "eligible").length;
  const reexportSelectedCount = selectedCases.filter((item) => item.clioBatchExport?.status === "already_exported").length;
  const potentiallySkippedSelectedCount = selectedCases.filter(
    (item) => item.clioBatchExport?.status === "potentially_skipped"
  ).length;
  const eligibleCaseIds = useMemo(
    () =>
      cases
        .filter(
          (item) =>
            item.clioBatchExport?.status === "eligible" ||
            (includeReexports && item.clioBatchExport?.status === "already_exported")
        )
        .map((item) => item.id),
    [cases, includeReexports]
  );
  const exportOperationBatches = useMemo(() => {
    const ranked = [...migrationBatches].sort((left, right) => {
      const leftNeedsReview = left.unresolvedReviewCount > 0 ? 1 : 0;
      const rightNeedsReview = right.unresolvedReviewCount > 0 ? 1 : 0;
      if (leftNeedsReview !== rightNeedsReview) return rightNeedsReview - leftNeedsReview;
      const leftReady = isMigrationBatchReady(left) ? 1 : 0;
      const rightReady = isMigrationBatchReady(right) ? 1 : 0;
      if (leftReady !== rightReady) return rightReady - leftReady;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
    return ranked.slice(0, 5);
  }, [migrationBatches]);
  const readyBatchCount = migrationBatches.filter(isMigrationBatchReady).length;
  const blockedBatchCount = migrationBatches.filter((item) => item.unresolvedReviewCount > 0).length;
  const reviewBlockedDocumentCount = migrationBatches.reduce(
    (total, item) => total + (item.unresolvedReviewCount ?? 0),
    0
  );

  function toggleCaseSelection(caseId: string) {
    const item = cases.find((candidate) => candidate.id === caseId);
    if (item?.clioBatchExport?.status === "already_exported" && !includeReexports) return;
    setSelectedCaseIds((current) =>
      current.includes(caseId) ? current.filter((item) => item !== caseId) : [...current, caseId]
    );
  }

  function selectEligibleCases() {
    setSelectedCaseIds(eligibleCaseIds);
  }

  async function handleBatchExport() {
    if (selectedCaseIds.length === 0) return;

    setDownloading("batch");
    setError(null);
    setSuccess(null);

    try {
      const orderedCaseIds = [...selectedCases]
        .sort(compareCasesForBatchExport)
        .map((item) => item.id);
      const response = await fetch(`${getApiBase()}/cases/exports/clio/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createClioIdempotencyKey(),
          ...getAuthHeader(),
        },
        ...getFetchOptions(),
        body: JSON.stringify({
          caseIds: orderedCaseIds,
          allowReexport: includeReexports,
          ...(includeReexports ? { reexportReason: "operator_override" } : {}),
        }),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, "Failed to download batch Clio handoff export."));
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = parseFileName(
        response.headers.get("content-disposition"),
        "clio-handoff-batch.zip"
      );
      anchor.click();
      window.URL.revokeObjectURL(downloadUrl);
      setSuccess(`Batch Clio handoff ZIP download started for ${selectedCaseIds.length} selected case${selectedCaseIds.length === 1 ? "" : "s"}.`);
      loadCases();
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Exports" }]}
        title="Exports"
        description="Download operator-ready CSV exports from the active dashboard."
      />

      {(error || success) && (
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
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {error ?? success}
          </p>
        </div>
      )}

      <DashboardCard title="Batch Clio handoff export" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
          Select multiple cases to export one combined Clio contacts CSV, one combined matters CSV, and a manifest in a single ZIP. Final include or skip decisions are still confirmed server-side and written to the manifest.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <input
            type="search"
            placeholder="Search by client, case #, or title"
            value={batchSearch}
            onChange={(event) => setBatchSearch(event.target.value)}
            className="onyx-input"
            style={{ minWidth: 260, flex: "1 1 260px" }}
          />
          <button
            type="button"
            onClick={selectEligibleCases}
            disabled={casesLoading || eligibleCaseIds.length === 0 || downloading !== null}
            className="onyx-btn-secondary"
          >
            {includeReexports ? "Select exportable" : "Select eligible"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedCaseIds([])}
            disabled={selectedCaseIds.length === 0 || downloading !== null}
            className="onyx-btn-secondary"
          >
            Clear selection
          </button>
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
              checked={includeReexports}
              onChange={(event) => setIncludeReexports(event.target.checked)}
              disabled={downloading !== null || casesLoading}
              style={{ accentColor: "var(--onyx-accent)" }}
            />
            Include re-exports
          </label>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <div className="onyx-card" style={{ padding: "0.9rem 1rem", border: "1px solid var(--onyx-border-subtle)" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Selected
            </p>
            <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>{selectedCaseIds.length}</p>
          </div>
          <div className="onyx-card" style={{ padding: "0.9rem 1rem", border: "1px solid var(--onyx-border-subtle)" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Eligible
            </p>
            <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "var(--onyx-success)" }}>{eligibleSelectedCount}</p>
          </div>
          <div className="onyx-card" style={{ padding: "0.9rem 1rem", border: "1px solid var(--onyx-border-subtle)" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Re-exports
            </p>
            <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#9a3412" }}>{reexportSelectedCount}</p>
          </div>
          <div className="onyx-card" style={{ padding: "0.9rem 1rem", border: "1px solid var(--onyx-border-subtle)" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Potentially skipped
            </p>
            <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#b45309" }}>{potentiallySkippedSelectedCount}</p>
          </div>
        </div>

        {casesError && (
          <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
            <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{casesError}</p>
            <button
              type="button"
              onClick={loadCases}
              className="onyx-link"
              style={{ marginTop: "0.5rem", background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        )}

        <div
          style={{
            border: "1px solid var(--onyx-border-subtle)",
            borderRadius: "var(--onyx-radius-md)",
            overflow: "hidden",
            marginBottom: "1rem",
          }}
        >
          {casesLoading ? (
            <p style={{ margin: 0, padding: "1rem", color: "var(--onyx-text-muted)" }}>Loading cases…</p>
          ) : filteredCases.length === 0 ? (
            <p style={{ margin: 0, padding: "1rem", color: "var(--onyx-text-muted)" }}>
              {cases.length === 0 ? "No cases available for batch export yet." : "No cases match your search."}
            </p>
          ) : (
            filteredCases.map((item, index) => {
              const checked = selectedCaseIds.includes(item.id);
              const status = item.clioBatchExport?.status ?? "potentially_skipped";
              const statusLabel =
                status === "eligible"
                  ? "Eligible"
                  : status === "already_exported"
                    ? "Already exported"
                    : "Potentially skipped";
              const statusColor =
                status === "eligible"
                  ? "var(--onyx-success)"
                  : status === "already_exported"
                    ? "#9a3412"
                    : "#b45309";
              const statusBackground =
                status === "eligible"
                  ? "rgba(34, 197, 94, 0.10)"
                  : status === "already_exported"
                    ? "rgba(154, 52, 18, 0.12)"
                    : "rgba(245, 158, 11, 0.14)";
              const title = item.clientName || item.title || "Untitled case";
              const subtitleParts = [item.caseNumber ? `Case #${item.caseNumber}` : null, item.title && item.title !== title ? item.title : null].filter(Boolean);
              const handoffSummary = item.clioHandoff?.alreadyExported && item.clioHandoff.lastExportedAt
                ? `Already handed off ${new Date(item.clioHandoff.lastExportedAt).toLocaleDateString()}${item.clioHandoff.lastActorLabel ? ` by ${item.clioHandoff.lastActorLabel}` : ""}.`
                : null;
              const handoffAuditSummary = item.clioHandoff?.alreadyExported
                ? [
                    formatCountLabel(item.clioHandoff.exportCount, "recorded handoff"),
                    item.clioHandoff.lastExportWasReExport ? "latest marked as re-export" : null,
                    formatCanonicalExportDate(item.clioHandoff.lastExportedAt)
                      ? `API export date ${formatCanonicalExportDate(item.clioHandoff.lastExportedAt)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" • ")
                : null;
              const selectionLocked = status === "already_exported" && !includeReexports;

              return (
                <label
                  key={item.id}
                  style={{
                    display: "flex",
                    gap: "0.9rem",
                    alignItems: "flex-start",
                    padding: "0.95rem 1rem",
                    borderTop: index === 0 ? "none" : "1px solid var(--onyx-border-subtle)",
                    background: checked ? "rgba(12, 74, 110, 0.04)" : "transparent",
                    cursor: downloading !== null || selectionLocked ? "not-allowed" : "pointer",
                    opacity: selectionLocked ? 0.72 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCaseSelection(item.id)}
                    disabled={downloading !== null || selectionLocked}
                    aria-label={`Select ${item.caseNumber ?? item.id}`}
                    style={{ marginTop: "0.2rem", accentColor: "var(--onyx-accent)" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        alignItems: "center",
                        marginBottom: "0.35rem",
                      }}
                    >
                      <strong style={{ fontSize: "0.95rem" }}>{title}</strong>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          borderRadius: 999,
                          padding: "0.2rem 0.55rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: statusColor,
                          background: statusBackground,
                        }}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {subtitleParts.length > 0 && (
                      <p style={{ margin: "0 0 0.35rem", fontSize: "0.85rem", color: "var(--onyx-text-muted)" }}>
                        {subtitleParts.join(" • ")}
                      </p>
                    )}
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
                      {item.clioBatchExport?.reason ?? "Eligibility will be confirmed when the export runs."}
                    </p>
                    {handoffSummary && (
                      <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>
                        {handoffSummary}
                      </p>
                    )}
                    {handoffAuditSummary && (
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>
                        {handoffAuditSummary}
                      </p>
                    )}
                    {selectionLocked && (
                      <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "#9a3412" }}>
                        Turn on include re-exports to select this case again.
                      </p>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleBatchExport}
            disabled={selectedCaseIds.length === 0 || downloading !== null || casesLoading}
            className="onyx-btn-primary"
          >
            {downloading === "batch" ? "Preparing…" : "Download batch Clio handoff ZIP"}
          </button>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            {selectedCaseIds.length === 0
              ? "Select at least one case to prepare the combined export."
              : `${selectedCaseIds.length} case${selectedCaseIds.length === 1 ? "" : "s"} selected: ${eligibleSelectedCount} first-time, ${reexportSelectedCount} re-export, ${potentiallySkippedSelectedCount} potentially skipped.`}
          </p>
        </div>
      </DashboardCard>

      <DashboardCard title="Migration batch exports and review" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
          Keep migration-driven export work in the same lane as Clio handoff. Export-ready batches stay visible here, and review-blocked batches link directly into the review queue for release.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <div className="onyx-card" style={{ padding: "0.9rem 1rem", border: "1px solid var(--onyx-border-subtle)" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Ready batches
            </p>
            <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "var(--onyx-success)" }}>{readyBatchCount}</p>
          </div>
          <div className="onyx-card" style={{ padding: "0.9rem 1rem", border: "1px solid var(--onyx-border-subtle)" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Blocked batches
            </p>
            <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#b45309" }}>{blockedBatchCount}</p>
          </div>
          <div className="onyx-card" style={{ padding: "0.9rem 1rem", border: "1px solid var(--onyx-border-subtle)" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Review-blocked docs
            </p>
            <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>{reviewBlockedDocumentCount}</p>
          </div>
        </div>

        {migrationBatchesError && (
          <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
            <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{migrationBatchesError}</p>
          </div>
        )}

        {migrationBatchesLoading ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading migration export work…</p>
        ) : exportOperationBatches.length === 0 ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>No migration batches are available yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {exportOperationBatches.map((item) => {
              const needsReview = (item.unresolvedReviewCount ?? 0) > 0;
              const ready = isMigrationBatchReady(item);
              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid var(--onyx-border-subtle)",
                    borderRadius: "var(--onyx-radius-md)",
                    padding: "0.95rem 1rem",
                    background: "var(--onyx-background-surface)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: "0.25rem" }}>
                      <strong style={{ fontSize: "0.95rem" }}>{getBatchLabel(item)}</strong>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                        Status: {item.status.replace(/_/g, " ").toLowerCase()} · Documents: {item.totalDocuments} · Routed cases: {item.routedCaseCount}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                        {needsReview
                          ? `${item.unresolvedReviewCount} document${item.unresolvedReviewCount === 1 ? "" : "s"} still need review before export.`
                          : ready
                            ? "Batch is ready for export or already handed off."
                            : "Open the batch to continue processing and handoff work."}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span className={needsReview ? "onyx-badge onyx-badge-warning" : ready ? "onyx-badge onyx-badge-success" : "onyx-badge onyx-badge-neutral"}>
                        {needsReview ? "Needs review" : ready ? "Ready for export" : "In progress"}
                      </span>
                      <Link href={getBatchDetailHref(item.id)} className="onyx-link">
                        Open batch
                      </Link>
                      {needsReview && (
                        <Link href={getBatchReviewHref(item)} className="onyx-link">
                          Open review queue
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Recent Clio handoff history" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          Review recent single-case and batch Clio handoff activity, including included and skipped cases.
        </p>

        {historyError && (
          <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
            <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{historyError}</p>
          </div>
        )}

        {historyLoading ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading handoff history…</p>
        ) : history.length === 0 ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>No Clio handoff history has been recorded yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {history.map((item) => {
              const reexportCaseCount = item.includedCases.filter((caseItem) => caseItem.isReExport).length;
              const countSummary = [
                formatCountLabel(item.includedCases.length, "included case"),
                item.skippedCases.length > 0 ? formatCountLabel(item.skippedCases.length, "skipped case") : null,
                reexportCaseCount > 0 ? formatCountLabel(reexportCaseCount, "re-export") : null,
              ]
                .filter(Boolean)
                .join(" • ");
              const rowSummary = [
                item.contactsRowCount !== null ? formatCountLabel(item.contactsRowCount, "contact row") : null,
                item.mattersRowCount !== null ? formatCountLabel(item.mattersRowCount, "matter row") : null,
              ]
                .filter(Boolean)
                .join(" • ");

              return (
                <div
                  key={item.exportId}
                  style={{
                    border: "1px solid var(--onyx-border-subtle)",
                    borderRadius: "var(--onyx-radius-md)",
                    padding: "1rem",
                    background: "var(--onyx-background-surface)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.6rem",
                      alignItems: "center",
                      marginBottom: "0.45rem",
                    }}
                  >
                    <strong style={{ fontSize: "0.95rem" }}>
                      {item.exportSubtype === "combined_batch"
                        ? "Batch Clio handoff"
                        : `${item.exportSubtype === "contacts" ? "Contacts" : "Matters"} CSV`}
                    </strong>
                    <span
                      style={{
                        borderRadius: 999,
                        padding: "0.18rem 0.55rem",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        color: item.exportType === "batch" ? "var(--onyx-accent)" : "#0f766e",
                        background: item.exportType === "batch" ? "rgba(12, 74, 110, 0.08)" : "rgba(15, 118, 110, 0.08)",
                      }}
                    >
                      {item.exportType === "batch" ? "Batch" : "Single case"}
                    </span>
                  </div>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                    {new Date(item.exportedAt).toLocaleString()}
                    {item.actorLabel ? ` • ${item.actorLabel}` : ""}
                  </p>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                    API timestamp: {formatCanonicalExportTimestamp(item.exportedAt)}
                  </p>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                    {countSummary}
                    {rowSummary ? ` • ${rowSummary}` : ""}
                  </p>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                    Included: {item.includedCases.map((caseItem) => `${caseItem.caseNumber ?? caseItem.clientName ?? caseItem.caseId}${caseItem.isReExport ? " (re-export)" : ""}`).join(", ") || "None"}
                  </p>
                  {item.reExportOverride && (
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "#9a3412" }}>
                      Re-export override used{item.reExportReason ? `: ${item.reExportReason}` : "."}
                    </p>
                  )}
                  {item.skippedCases.length > 0 && (
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
                      Skipped: {item.skippedCases.map((caseItem) => `${caseItem.caseNumber ?? caseItem.caseId} (${caseItem.reason})`).join(", ")}
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                    {item.archiveFileName ?? item.contactsFileName ?? item.mattersFileName ?? "Export artifact recorded"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Clio CSV exports" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          Export contacts first, then matters, when moving data into Clio Manage.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
          {EXPORT_ACTIONS.map((action) => (
            <div
              key={action.id}
              style={{
                border: "1px solid var(--onyx-border-subtle)",
                borderRadius: "var(--onyx-radius-md)",
                padding: "1rem",
                background: "var(--onyx-background-surface)",
              }}
            >
              <h2 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>{action.title}</h2>
              <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
                {action.description}
              </p>
              <button
                type="button"
                onClick={() => handleDownload(action)}
                disabled={downloading !== null}
                className="onyx-btn-primary"
              >
                {downloading === action.id ? "Preparing…" : `Download ${action.defaultFileName}`}
              </button>
            </div>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard title="Operator notes" style={{ marginBottom: "1rem" }}>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
          <li>Contacts CSV is generated from exportable client contact data across the firm.</li>
          <li>Matters CSV is generated from case number, title, and client details across the firm.</li>
          <li>These downloads come directly from the active API, so they work without backup-only proxy routes.</li>
        </ul>
      </DashboardCard>

      <DashboardCard title="Case-scoped exports">
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          Per-case export actions are the next UI parity pass. For now, operators can work from the case workspace while firm-level CSV exports live here.
        </p>
        <Link href="/dashboard/cases" className="onyx-link">
          Open case list
        </Link>
      </DashboardCard>
    </div>
  );
}
