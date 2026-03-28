"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

type Doc = { id: string; originalName: string; status: string; createdAt: string; pageCount: number | null };

export default function CaseDocumentsTab({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [attachDocId, setAttachDocId] = useState("");
  const [availableDocs, setAvailableDocs] = useState<{ id: string; originalName: string; routedCaseId: string | null }[]>([]);
  const [attaching, setAttaching] = useState(false);

  const loadDocuments = useCallback(async () => {
    const res = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/documents");
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: Doc[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }, [caseId]);

  const loadAvailableDocs = useCallback(async () => {
    const res = await fetch("/api/documents?limit=50");
    const data = (await res.json().catch(() => ({}))) as { items?: { id: string; originalName: string; routedCaseId?: string | null }[] };
    const list = Array.isArray(data.items) ? data.items : [];
    setAvailableDocs(list.map((d) => ({ id: d.id, originalName: d.originalName, routedCaseId: d.routedCaseId ?? null })));
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadDocuments(), loadAvailableDocs()]);
      setLoading(false);
    }
    init();
  }, [loadDocuments, loadAvailableDocs]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/documents/upload", {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      const data = JSON.parse(text) as { ok?: boolean; documentId?: string };
      if (data.ok) {
        setUploadMsg("Uploaded and attached.");
        setFile(null);
        await loadDocuments();
        await loadAvailableDocs();
      }
    } catch (err: unknown) {
      setUploadMsg(`Upload failed: ${String((err as Error)?.message ?? err)}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleAttach(e: React.FormEvent) {
    e.preventDefault();
    if (!attachDocId) return;
    setAttaching(true);
    try {
      const res = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/documents/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: attachDocId }),
      });
      if (res.ok) {
        setAttachDocId("");
        await loadDocuments();
        await loadAvailableDocs();
      }
    } finally {
      setAttaching(false);
    }
  }

  const attachedIds = new Set(items.map((d) => d.id));
  const options = availableDocs.filter((d) => !attachedIds.has(d.id) && d.routedCaseId !== caseId);

  if (loading) {
    return <p style={{ color: "#666", fontSize: 14 }}>Loading documents…</p>;
  }

  return (
    <section>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Documents</h2>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Documents attached to this case. Upload new files or attach existing documents from your firm.
      </p>

      <div style={{ marginBottom: 24, padding: 16, border: "1px solid #e5e5e5", borderRadius: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Upload a document</div>
        <form onSubmit={handleUpload} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button
            type="submit"
            disabled={!file || uploading}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #111",
              background: uploading ? "#ccc" : "#111",
              color: "#fff",
              fontSize: 14,
              cursor: !file || uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "Uploading…" : "Upload & attach"}
          </button>
        </form>
        {uploadMsg && <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>{uploadMsg}</div>}
      </div>

      {options.length > 0 && (
        <div style={{ marginBottom: 24, padding: 16, border: "1px solid #e5e5e5", borderRadius: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Attach existing document</div>
          <form onSubmit={handleAttach} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <select
              value={attachDocId}
              onChange={(e) => setAttachDocId(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", minWidth: 260, fontSize: 14 }}
            >
              <option value="">Select a document…</option>
              {options.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.originalName} {d.routedCaseId ? `(on another case)` : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={attaching || !attachDocId}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontSize: 14,
                cursor: attaching || !attachDocId ? "not-allowed" : "pointer",
              }}
            >
              {attaching ? "Attaching…" : "Attach"}
            </button>
          </form>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>No documents attached yet. Upload or attach documents above.</p>
      ) : (
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee", background: "#fafafa" }}>
                <th style={{ padding: "10px 12px", fontSize: 13 }}>Document</th>
                <th style={{ padding: "10px 12px", fontSize: 13 }}>Status</th>
                <th style={{ padding: "10px 12px", fontSize: 13 }}>Created</th>
                <th style={{ padding: "10px 12px", fontSize: 13 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid #f3f3f3" }}>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    <Link href={`/documents/${d.id}`} style={{ color: "#06c", textDecoration: "underline" }}>
                      {d.originalName}
                    </Link>
                    {d.pageCount != null && d.pageCount > 0 && (
                      <span style={{ color: "#888", marginLeft: 8 }}>({d.pageCount} pages)</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{d.status}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{new Date(d.createdAt).toLocaleString()}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>
                    <Link href={`/documents/${d.id}`} style={{ fontSize: 13, color: "#06c", textDecoration: "underline" }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
