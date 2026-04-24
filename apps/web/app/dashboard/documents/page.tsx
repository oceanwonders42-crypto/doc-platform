"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  formatApiClientError,
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
import { DataTable, Column } from "@/components/dashboard/DataTable";
import { ErrorNotice } from "@/components/dashboard/ErrorNotice";
import { PageHeader } from "@/components/dashboard/PageHeader";

type Doc = {
  id: string;
  originalName: string;
  status: string;
  pageCount: number | null;
  source?: string;
  routedCaseId: string | null;
  createdAt: string;
  processedAt: string | null;
  duplicateOfId?: string | null;
  duplicateMatchCount?: number;
};

type DocumentsListResponse = {
  ok?: boolean;
  success?: boolean;
  items?: Doc[];
  documents?: Doc[];
  error?: string;
  code?: string;
};

type UploadResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  documentIds?: string[];
  duplicatesDetected?: number;
  duplicateIndices?: number[];
  errors?: { file: string; error: string; code?: string }[];
};

type UploadResultItem = {
  fileName: string;
  status: "queued" | "duplicate" | "failed";
  detail: string;
};

function extractDocumentItems(res: DocumentsListResponse): Doc[] | null {
  if (Array.isArray(res.items)) return res.items;
  if (Array.isArray(res.documents)) return res.documents;
  return null;
}

function formatUploadError(params: {
  responseStatus?: number;
  responseCode?: string;
  responseError?: string;
  thrownError?: unknown;
}): string {
  const { responseStatus, responseCode, responseError, thrownError } = params;

  if (responseCode === "PAYLOAD_TOO_LARGE" || responseStatus === 413) {
    return "One or more files were larger than the 25MB upload limit. Split them or upload fewer files at once.";
  }

  if (
    responseCode === "UNAUTHORIZED" ||
    responseStatus === 401 ||
    responseStatus === 403 ||
    /invalid api key|unauthorized|forbidden/i.test(responseError ?? "")
  ) {
    return "Your session is not authorized to upload documents right now. Sign in again and retry.";
  }

  if (thrownError != null) {
    return formatApiClientError(thrownError, "Upload failed.", {
      deploymentMessage:
        "The document ingest endpoint returned HTML instead of JSON. Check the active API host and whether web or API is serving an older build.",
    });
  }

  return responseError ?? "Upload failed.";
}

function formatUploadSummary(results: UploadResultItem[]): string {
  const queued = results.filter((item) => item.status === "queued").length;
  const duplicates = results.filter((item) => item.status === "duplicate").length;
  const failed = results.filter((item) => item.status === "failed").length;

  const parts = [];
  if (queued > 0) parts.push(`${queued} queued for processing`);
  if (duplicates > 0) parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"} linked to existing documents`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" • ");
}

function createUploadForm(files: File[]): FormData {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  return form;
}

async function requestUpload(files: File[]): Promise<{ response: Response; json: UploadResponse }> {
  const base = getApiBase();
  const endpoints = base ? [`${base}/me/ingest/bulk`, "/api/ingest/bulk"] : ["/api/ingest/bulk"];
  const requestInit = {
    method: "POST",
    headers: getAuthHeader(),
    ...getFetchOptions(),
  };

  let lastError: unknown = null;
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      ...requestInit,
      body: createUploadForm(files),
    });

    try {
      const json = (await parseJsonResponse(response)) as UploadResponse;
      return { response, json };
    } catch (requestError) {
      const shouldTryProxy =
        endpoint !== "/api/ingest/bulk" &&
        requestError instanceof Error &&
        requestError.message.includes("Server returned HTML instead of JSON");

      if (shouldTryProxy) {
        lastError = requestError;
        continue;
      }

      throw requestError;
    }
  }

  throw lastError ?? new Error("Upload failed.");
}

export default function DocumentsPage() {
  const [items, setItems] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCaseId, setFilterCaseId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const [uploadResults, setUploadResults] = useState<UploadResultItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    const base = getApiBase();
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (filterStatus) params.set("status", filterStatus);
    if (filterCaseId) params.set("caseId", filterCaseId);
    const query = params.toString();
    const requestInit = { headers: getAuthHeader(), ...getFetchOptions() };
    const directUrl = base ? `${base}/me/documents?${query}` : `/api/documents?${query}`;

    fetch(directUrl, requestInit)
      .then(async (response) => {
        try {
          return await parseJsonResponse(response);
        } catch (requestError) {
          const shouldTryProxy =
            directUrl !== `/api/documents?${query}` &&
            requestError instanceof Error &&
            requestError.message.includes("Server returned HTML instead of JSON");

          if (!shouldTryProxy) throw requestError;

          const proxyResponse = await fetch(`/api/documents?${query}`, requestInit);
          return parseJsonResponse(proxyResponse);
        }
      })
      .then((response: unknown) => {
        const data = response as DocumentsListResponse;
        const docs = extractDocumentItems(data);
        if (docs) {
          setItems(docs);
          setError(null);
          return;
        }

        setItems([]);
        setError(data.error ?? "We couldn't load your documents.");
      })
      .catch((requestError) => {
        setError(
          formatApiClientError(
            requestError,
            "We couldn't load your documents. Please try again.",
            {
              deploymentMessage:
                "The documents API returned HTML instead of JSON. Check the API host, routing, and whether web is still serving a stale build.",
            }
          )
        );
      })
      .finally(() => setLoading(false));
  }, [filterCaseId, filterStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const files = Array.from(fileList);

      setUploading(true);
      setUploadNotice(null);
      setUploadResults([]);

      try {
        const { response, json } = await requestUpload(files);

        const duplicateIndexSet = new Set(json.duplicateIndices ?? []);
        const failedByFile = new Map(
          (json.errors ?? []).map((entry) => [entry.file, entry.error])
        );

        const results: UploadResultItem[] = files.map((file, index) => {
          const failedMessage = failedByFile.get(file.name);
          if (failedMessage) {
            return { fileName: file.name, status: "failed", detail: failedMessage };
          }
          if (duplicateIndexSet.has(index)) {
            return {
              fileName: file.name,
              status: "duplicate",
              detail: "Matched to an existing document instead of creating a new one.",
            };
          }
          return {
            fileName: file.name,
            status: "queued",
            detail: "Queued for OCR and case routing.",
          };
        });

        setUploadResults(results);

        if (!response.ok) {
          const message = formatUploadError({
            responseStatus: response.status,
            responseCode: json.code,
            responseError: json.error,
          });
          setUploadNotice({ tone: "error", message });
          return;
        }

        const summaryMessage = formatUploadSummary(results);
        const hasFailures = results.some((item) => item.status === "failed");
        setUploadNotice({
          tone: hasFailures ? "warning" : "success",
          message: summaryMessage || "Files were submitted successfully.",
        });
        refresh();
      } catch (requestError) {
        const message = formatUploadError({ thrownError: requestError });
        setUploadNotice({ tone: "error", message });
        setUploadResults(
          files.map((file) => ({
            fileName: file.name,
            status: "failed",
            detail: message,
          }))
        );
      } finally {
        setUploading(false);
      }
    },
    [refresh]
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  const columns: Column<Doc>[] = useMemo(
    () => [
      {
        key: "name",
        header: "Document",
        render: (row) => (
          <Link href={`/dashboard/documents/${row.id}`} className="onyx-link" style={{ fontWeight: 500 }}>
            {row.originalName}
          </Link>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
            <span className="onyx-badge onyx-badge-neutral">{row.status}</span>
            {row.duplicateOfId ? (
              <span className="onyx-badge onyx-badge-warning" style={{ fontSize: "0.7rem" }}>
                Duplicate
              </span>
            ) : null}
            {(row.duplicateMatchCount ?? 0) > 0 ? (
              <span className="onyx-badge onyx-badge-neutral" style={{ fontSize: "0.7rem" }}>
                +{row.duplicateMatchCount}
              </span>
            ) : null}
          </span>
        ),
      },
      { key: "pages", header: "Pages", render: (row) => row.pageCount ?? "—" },
      {
        key: "case",
        header: "Case",
        render: (row) =>
          row.routedCaseId ? (
            <Link href={`/dashboard/cases/${row.routedCaseId}`} className="onyx-link">
              Open case
            </Link>
          ) : (
            "Needs routing"
          ),
      },
      { key: "created", header: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() },
    ],
    []
  );

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Documents" }]}
        title="Documents"
        description="Upload, monitor, and route incoming records without losing file-level visibility."
        action={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="onyx-input"
              style={{ minWidth: 150 }}
            >
              <option value="">All statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="NEEDS_REVIEW">Needs review</option>
              <option value="UNMATCHED">Unmatched</option>
              <option value="FAILED">Failed</option>
            </select>
            <input
              type="text"
              placeholder="Search by case or client"
              value={filterCaseId}
              onChange={(event) => setFilterCaseId(event.target.value)}
              className="onyx-input"
              style={{ minWidth: 180 }}
            />
          </div>
        }
      />

      <div
        role="button"
        tabIndex={0}
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragOver(false);
        }}
        onClick={() => document.getElementById("doc-upload-input")?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            document.getElementById("doc-upload-input")?.click();
          }
        }}
        style={{
          marginBottom: "1rem",
          padding: "2rem 1.5rem",
          border: `2px dashed ${dragOver ? "var(--onyx-accent)" : "var(--onyx-border)"}`,
          borderRadius: "var(--onyx-radius-md)",
          background: dragOver ? "var(--onyx-surface-subtle)" : "var(--onyx-card)",
          cursor: uploading ? "wait" : "pointer",
          textAlign: "center",
          outline: "none",
          transition: "border-color 0.15s ease, background 0.15s ease",
        }}
      >
        <input
          id="doc-upload-input"
          type="file"
          multiple
          accept=".pdf,.tif,.tiff,.jpg,.jpeg,image/*,application/pdf"
          style={{ display: "none" }}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <p style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>
          {uploading ? "Uploading documents…" : "Drop files here or click to upload"}
        </p>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--onyx-text-muted)", lineHeight: 1.55 }}>
          Bulk upload targets the live ingest API and retries through the JSON-safe proxy if the direct API target drifts.
        </p>
      </div>

      {uploadNotice ? (
        <ErrorNotice
          tone={uploadNotice.tone}
          title={uploadNotice.tone === "error" ? "Upload failed" : uploadNotice.tone === "warning" ? "Upload completed with issues" : "Upload submitted"}
          message={uploadNotice.message}
          style={{ marginBottom: "1rem" }}
        />
      ) : null}

      {uploadResults.length > 0 ? (
        <div className="onyx-card" style={{ padding: "1rem 1.1rem", marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--onyx-text-muted)" }}>
            Latest upload results
          </p>
          <div style={{ display: "grid", gap: "0.6rem" }}>
            {uploadResults.map((item) => (
              <div
                key={`${item.fileName}-${item.status}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  alignItems: "flex-start",
                  borderBottom: "1px solid var(--onyx-border-subtle)",
                  paddingBottom: "0.6rem",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, wordBreak: "break-word" }}>{item.fileName}</p>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                    {item.detail}
                  </p>
                </div>
                <span
                  className={`onyx-badge ${
                    item.status === "failed"
                      ? "onyx-badge-warning"
                      : item.status === "duplicate"
                        ? "onyx-badge-neutral"
                        : "onyx-badge-success"
                  }`}
                >
                  {item.status === "queued" ? "Queued" : item.status === "duplicate" ? "Duplicate" : "Failed"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <ErrorNotice
          message={error}
          action={
            <button type="button" onClick={refresh} className="onyx-btn-secondary">
              Try again
            </button>
          }
          style={{ marginBottom: "1rem" }}
        />
      ) : null}

      {loading ? (
        <p style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>Loading documents…</p>
      ) : error ? null : items.length === 0 ? (
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.4rem", fontSize: "1rem", fontWeight: 600 }}>No documents yet</p>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--onyx-text-muted)" }}>
            Upload PDFs or images above to start the intake pipeline.
          </p>
        </div>
      ) : (
        <div className="onyx-card" style={{ overflow: "hidden" }}>
          <DataTable columns={columns} data={items} emptyMessage="No documents match your filters." />
        </div>
      )}
    </div>
  );
}
