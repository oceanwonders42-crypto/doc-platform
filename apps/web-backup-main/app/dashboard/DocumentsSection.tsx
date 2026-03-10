"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import DocumentTable, { type DocumentTableItem } from "./DocumentTable";
import LoadingSpinner from "../components/LoadingSpinner";
import HelpTooltip from "../components/HelpTooltip";
import { useToast } from "../components/ToastProvider";

const PAGE_SIZE = 20;

type DocumentsResponse = {
  items: DocumentTableItem[];
  nextCursor: string | null;
};

export default function DocumentsSection() {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<DocumentTableItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await load(null);
      setItems(data.items);
      setNextCursor(data.nextCursor);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  const load = useCallback(async (cursor: string | null) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/documents?${params}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    }
    const data = (await res.json()) as DocumentsResponse;
    return data;
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load(null)
      .then((data) => {
        setItems(data.items);
        setNextCursor(data.nextCursor);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  async function handleLoadMore() {
    if (!nextCursor || loadMoreLoading) return;
    setLoadMoreLoading(true);
    try {
      const data = await load(nextCursor);
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadMoreLoading(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("source", "web");
      fd.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      const data = JSON.parse(text) as { ok?: boolean };
      if (data.ok !== false) {
        const refreshed = await load(null);
        setItems(refreshed.items);
        setNextCursor(refreshed.nextCursor);
        toast.toastSuccess("Document uploaded");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          Recent documents
          <HelpTooltip text="Most recently processed documents. Upload new files or click to view details." />
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LoadingSpinner size={20} />
          <span style={{ color: "#666", fontSize: 14 }}>Loading…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          Recent documents
          <HelpTooltip text="Most recently processed documents. Upload new files or click to view details." />
        </h2>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: "1px solid #ccc",
              borderRadius: 6,
              background: refreshing ? "#f0f0f0" : "#fff",
              cursor: refreshing ? "not-allowed" : "pointer",
              fontWeight: 500,
            }}
            aria-label="Retry"
          >
            {refreshing ? "Retrying…" : "Retry"}
          </button>
        </div>
        <p style={{ color: "#666", fontSize: 14 }}>Something went wrong loading data.</p>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          Recent documents
          <HelpTooltip text="Most recently processed documents. Upload new files or click to view details." />
        </h2>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: "1px solid #ccc",
              borderRadius: 6,
              background: refreshing ? "#f0f0f0" : "#fff",
              cursor: refreshing ? "not-allowed" : "pointer",
              fontWeight: 500,
            }}
            aria-label="Refresh"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>No documents processed yet.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 8,
            background: uploading ? "#f0f0f0" : "#111",
            color: uploading ? "#666" : "#fff",
            cursor: uploading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {uploading ? "Uploading…" : "Upload first document"}
        </button>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          Recent documents
          <HelpTooltip text="Most recently processed documents. Upload new files or click to view details." />
        </h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: "6px 12px",
            fontSize: 13,
            border: "1px solid #ccc",
            borderRadius: 6,
            background: refreshing ? "#f0f0f0" : "#fff",
            cursor: refreshing ? "not-allowed" : "pointer",
            fontWeight: 500,
          }}
          aria-label="Refresh documents"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <DocumentTable items={items} />
      {nextCursor ? (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadMoreLoading}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 8,
              background: loadMoreLoading ? "#f0f0f0" : "#fff",
              cursor: loadMoreLoading ? "not-allowed" : "pointer",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {loadMoreLoading && <LoadingSpinner size={16} />}
            {loadMoreLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
