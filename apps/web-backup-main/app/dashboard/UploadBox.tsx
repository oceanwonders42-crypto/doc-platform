"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UploadBox() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [duplicateDocId, setDuplicateDocId] = useState<string | null>(null);

  async function onUpload() {
    if (!file) return;

    setLoading(true);
    setMsg(null);
    setDuplicateDocId(null);

    try {
      const fd = new FormData();
      fd.append("source", "web");
      fd.append("file", file);

      const res = await fetch("/api/ingest", {
        method: "POST",
        body: fd,
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text);

      const data = JSON.parse(text) as { ok?: boolean; duplicate?: boolean; documentId?: string; existingId?: string };
      if (data.duplicate === true && data.documentId) {
        setDuplicateDocId(data.existingId ?? data.documentId);
        setMsg("Duplicate detected — same file already ingested in the last 30 days.");
      } else {
        setMsg("Uploaded ✅ (processing in background)");
      }
      setFile(null);

      // Refresh the server component data
      router.refresh();
    } catch (e: any) {
      setMsg(`Upload failed: ${String(e?.message ?? e)}`.slice(0, 300));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Upload a document</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <button
          onClick={onUpload}
          disabled={!file || loading}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: loading ? "#f3f3f3" : "#111",
            color: loading ? "#555" : "#fff",
            cursor: !file || loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Uploading..." : "Upload"}
        </button>

        {file ? <span style={{ fontSize: 12, color: "#666" }}>{file.name}</span> : null}
      </div>

      {msg ? (
        <div style={{ marginTop: 10, fontSize: 12, color: msg.includes("failed") ? "#b00020" : duplicateDocId ? "#e65100" : "#0a7a0a" }}>
          {msg}
          {duplicateDocId && (
            <>
              {" "}
              <Link
                href={`/documents/${duplicateDocId}`}
                style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}
              >
                View existing document
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
