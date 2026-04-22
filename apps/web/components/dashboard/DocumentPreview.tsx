"use client";

import Link from "next/link";
import { getApiBase, getAuthHeader } from "../../lib/api";

export function DocumentPreview({
  id,
  name,
  type,
  status,
  pageCount,
  showPreview = true,
}: {
  id: string;
  name: string;
  type?: string;
  status?: string;
  pageCount?: number;
  showPreview?: boolean;
}) {
  const base = getApiBase();
  const previewUrl = `${base}/documents/${id}/preview`;
  const downloadUrl = `${base}/documents/${id}/download`;

  function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    fetch(downloadUrl, { headers: getAuthHeader() })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name || "document";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {});
  }

  return (
    <div className="onyx-card" style={{ padding: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <Link href={`/dashboard/documents/${id}`} className="onyx-link" style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
            {name}
          </Link>
          <div style={{ fontSize: "0.75rem", color: "var(--onyx-text-muted)", marginTop: "0.25rem" }}>
            {type && <span>{type}</span>}
            {pageCount != null && <span> · {pageCount} pages</span>}
            {status && <span> · {status}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {showPreview && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="onyx-btn-primary" style={{ fontSize: "0.875rem", textDecoration: "none" }}>
              Preview
            </a>
          )}
          <button type="button" onClick={handleDownload} className="onyx-link" style={{ fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer" }}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
