"use client";

import { useState, useEffect, useCallback } from "react";
import DocumentTable, { type DocumentTableItem } from "./DocumentTable";

const PAGE_SIZE = 20;

type DocumentsResponse = {
  items: DocumentTableItem[];
  nextCursor: string | null;
};

export default function DocumentsSection() {
  const [items, setItems] = useState<DocumentTableItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Recent documents</h2>
        <p style={{ color: "#666", fontSize: 14 }}>Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Recent documents</h2>
        <p style={{ color: "#b00020", fontSize: 14 }}>{error}</p>
      </section>
    );
  }

  return (
    <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Recent documents</h2>
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
            }}
          >
            {loadMoreLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
