"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatApiClientError, getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "../../lib/api";

type PreviewState =
  | { status: "idle"; url: null; contentType: null; error: null }
  | { status: "loading"; url: null; contentType: null; error: null }
  | { status: "ready"; url: string; contentType: string; error: null }
  | { status: "unsupported" | "error"; url: null; contentType: null; error: string };

export function DocumentPreview({
  id,
  name,
  type,
  status,
  pageCount,
  ocrText,
  showPreview = true,
}: {
  id: string;
  name: string;
  type?: string;
  status?: string;
  pageCount?: number;
  ocrText?: string | null;
  showPreview?: boolean;
}) {
  const base = getApiBase();
  const [preview, setPreview] = useState<PreviewState>({
    status: "idle",
    url: null,
    contentType: null,
    error: null,
  });

  useEffect(() => {
    return () => {
      if (preview.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview.url]);

  async function loadPreview() {
    if (!base || !showPreview) return;
    if (preview.url) URL.revokeObjectURL(preview.url);
    setPreview({ status: "loading", url: null, contentType: null, error: null });
    try {
      const res = await fetch(`${base}/documents/${id}/preview`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        const message = contentType.toLowerCase().includes("application/json")
          ? ((await res.json().catch(() => ({}))) as { error?: string }).error
          : null;
        setPreview({
          status: res.status === 415 ? "unsupported" : "error",
          url: null,
          contentType: null,
          error: message ?? `Preview failed with HTTP ${res.status}.`,
        });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreview({
        status: "ready",
        url,
        contentType: contentType || blob.type || type || "application/octet-stream",
        error: null,
      });
    } catch (requestError) {
      setPreview({
        status: "error",
        url: null,
        contentType: null,
        error: formatApiClientError(requestError, "Preview failed."),
      });
    }
  }

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    try {
      const response = await fetch(`${base}/documents/${id}/download`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as {
        ok?: boolean;
        url?: string;
        originalName?: string;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.url) {
        throw new Error(data.error ?? "Download failed.");
      }
      const anchor = document.createElement("a");
      anchor.href = data.url;
      anchor.download = data.originalName ?? name ?? "document";
      anchor.rel = "noopener";
      anchor.click();
    } catch {
      setPreview({
        status: "error",
        url: null,
        contentType: null,
        error: "Download failed. Please refresh and try again.",
      });
    }
  }

  const previewIsImage = preview.status === "ready" && preview.contentType?.startsWith("image/");
  const previewIsPdf = preview.status === "ready" && preview.contentType === "application/pdf";

  return (
    <div className="onyx-card" style={{ padding: "1rem", display: "grid", gap: "0.85rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/dashboard/documents/${id}`} className="onyx-link" style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            {name}
          </Link>
          <div style={{ fontSize: "0.75rem", color: "var(--onyx-text-muted)", marginTop: "0.25rem" }}>
            {type ? <span>{type}</span> : null}
            {pageCount != null ? <span> · {pageCount} pages</span> : null}
            {status ? <span> · {status}</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {showPreview ? (
            <button type="button" onClick={loadPreview} className="onyx-btn-primary" disabled={preview.status === "loading"}>
              {preview.status === "loading" ? "Loading..." : "Preview"}
            </button>
          ) : null}
          <button type="button" onClick={handleDownload} className="onyx-link" style={{ fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer" }}>
            Download
          </button>
        </div>
      </div>

      {preview.status === "ready" ? (
        <div
          style={{
            border: "1px solid var(--onyx-border-subtle)",
            borderRadius: "var(--onyx-radius-md)",
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {previewIsPdf ? (
            <iframe
              title={`Preview ${name}`}
              src={preview.url}
              style={{ width: "100%", height: 520, border: 0, display: "block" }}
            />
          ) : previewIsImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={`Preview of ${name}`} style={{ width: "100%", maxHeight: 520, objectFit: "contain", display: "block" }} />
          ) : null}
        </div>
      ) : null}

      {(preview.status === "unsupported" || preview.status === "error") ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p style={{ margin: 0, color: "var(--onyx-warning)", fontSize: "0.84rem" }}>{preview.error}</p>
          {ocrText ? (
            <div style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "0.85rem", background: "var(--onyx-background-surface)" }}>
              <p style={{ margin: "0 0 0.45rem", fontWeight: 700, fontSize: "0.82rem" }}>OCR text fallback</p>
              <pre style={{ margin: 0, maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.78rem" }}>
                {ocrText.length > 8000 ? `${ocrText.slice(0, 8000)}\n\n... (truncated)` : ocrText}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
