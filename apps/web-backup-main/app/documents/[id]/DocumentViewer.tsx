"use client";

import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function DocumentViewer({ documentId }: { documentId: string }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/documents/${documentId}/download`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data?.url) {
          setPdfUrl(data.url);
        } else {
          setError(data?.error || "Failed to load document");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  if (error) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: "center",
          color: "#b91c1c",
          background: "#fef2f2",
          borderRadius: 8,
        }}
      >
        {error}
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "#666",
          background: "#f9fafb",
          borderRadius: 8,
        }}
      >
        Loading PDF…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Document
        file={pdfUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={(e) => setError(e?.message || "Failed to load PDF")}
      >
        <Page
          pageNumber={pageNumber}
          renderTextLayer
          renderAnnotationLayer
          width={Math.min(700, typeof window !== "undefined" ? window.innerWidth - 400 : 700)}
        />
      </Document>
      {numPages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
            style={{
              padding: "6px 12px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              background: "#fff",
              cursor: pageNumber <= 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 14 }}>
            Page {pageNumber} of {numPages}
          </span>
          <button
            type="button"
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
            style={{
              padding: "6px 12px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              background: "#fff",
              cursor: pageNumber >= numPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
