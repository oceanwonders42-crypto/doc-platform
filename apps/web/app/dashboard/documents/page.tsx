"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";

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

type DocumentsListResponse = { ok?: boolean; items?: Doc[] };

function isDocumentsListResponse(res: unknown): res is DocumentsListResponse {
  return typeof res === "object" && res !== null;
}

export default function DocumentsPage() {
  const [items, setItems] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterCaseId, setFilterCaseId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    const base = getApiBase();
    const params = new URLSearchParams();
    params.set("limit", "50");
    if (filterStatus) params.set("status", filterStatus);
    if (filterCaseId) params.set("caseId", filterCaseId);
    fetch(`${base}/me/documents?${params.toString()}`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isDocumentsListResponse(res) && res.ok && res.items) {
          setItems(res.items);
          setError(null);
        } else {
          setError("We couldn't load your documents. Please try again.");
        }
      })
      .catch(() => {
        setError("We couldn't load your documents. Please check your connection and try again.");
      })
      .finally(() => setLoading(false));
  }, [filterStatus, filterCaseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const base = getApiBase();
      const form = new FormData();
      for (let i = 0; i < fileList.length; i++) {
        form.append("files", fileList[i]);
      }
      setUploading(true);
      setUploadError(null);
      setUploadMessage(null);
      try {
        const res = await fetch(`${base}/me/ingest/bulk`, {
          method: "POST",
          headers: getAuthHeader(),
          ...getFetchOptions(),
          body: form,
        });
        const data = await parseJsonResponse(res);
        const json = data as { ok?: boolean; error?: string; documentIds?: string[]; duplicatesDetected?: number; duplicateIndices?: number[]; errors?: { file: string; error: string }[] };
        if (!res.ok) {
          setUploadError(json.error ?? `Upload failed (${res.status})`);
          return;
        }
        if (json.ok && (json.documentIds?.length ?? 0) > 0) {
          refresh();
          const dupCount = json.duplicatesDetected ?? 0;
          if (dupCount > 0) {
            setUploadError(null);
            setUploadMessage(`${dupCount} file(s) were duplicates and linked to existing documents.`);
          }
        }
        if (json.errors && json.errors.length > 0) {
          setUploadError(json.errors.map((e: { file: string; error: string }) => `${e.file}: ${e.error}`).join("; "));
        }
      } catch (e) {
        setUploadError((e as Error)?.message ?? "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [refresh]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const columns: Column<Doc>[] = [
    {
      key: "name",
      header: "Document",
      render: (row) => (
        <Link href={`/dashboard/documents/${row.id}`} className="onyx-link" style={{ fontWeight: 500 }}>
          {row.originalName}
        </Link>
      ),
    },
    { key: "status", header: "Status", render: (row) => (
        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
          <span className="onyx-badge onyx-badge-neutral">{row.status}</span>
          {row.duplicateOfId && <span className="onyx-badge onyx-badge-warning" style={{ fontSize: "0.7rem" }} title="Duplicate of another document">Dup</span>}
          {(row.duplicateMatchCount ?? 0) > 0 && <span className="onyx-badge onyx-badge-neutral" style={{ fontSize: "0.7rem" }} title={`${row.duplicateMatchCount} duplicate(s)`}>+{row.duplicateMatchCount}</span>}
        </span>
      ) },
    { key: "pages", header: "Pages", render: (row) => row.pageCount ?? "—" },
    { key: "case", header: "Case", render: (row) => row.routedCaseId ? <Link href={`/dashboard/cases/${row.routedCaseId}`} className="onyx-link">View</Link> : "—" },
    { key: "created", header: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() },
    {
      key: "action",
      header: "",
      render: (row) => (
        <span style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/dashboard/documents/${row.id}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>View</Link>
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Documents" }]}
        title="Documents"
        description="Browse and manage case documents"
        action={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 140 }}
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
              onChange={(e) => setFilterCaseId(e.target.value)}
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
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => document.getElementById("doc-upload-input")?.click()}
        onKeyDown={(e) => e.key === "Enter" && document.getElementById("doc-upload-input")?.click()}
        style={{
          marginBottom: "1.5rem",
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
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.9375rem" }}>Uploading…</p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
            Drag and drop PDFs or images here, or click to select files. New documents will appear in the list below.
          </p>
        )}
      </div>

      {uploadError && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{uploadError}</p>
        </div>
      )}

      {uploadMessage && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-success)" }}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-success)" }}>{uploadMessage}</p>
        </div>
      )}

      {error && (
        <div className="onyx-card" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{error}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="onyx-link"
            style={{ marginTop: "0.5rem", fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>Loading…</p>
      ) : error ? null : items.length === 0 ? (
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "1rem", color: "var(--onyx-text-muted)", marginBottom: "0.5rem" }}>No documents yet</p>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Upload PDFs or images above to get started. They will be processed and listed here.
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
