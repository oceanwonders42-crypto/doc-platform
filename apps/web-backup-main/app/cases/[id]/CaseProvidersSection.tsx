"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";

type Provider = {
  id: string;
  name: string;
  address?: string | null;
  city: string;
  state: string;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
};

type CaseProviderItem = {
  id: string;
  providerId: string;
  relationship: string;
  createdAt: string;
  provider: Provider;
};

type ProviderOption = {
  id: string;
  name: string;
  city: string;
  state: string;
  address?: string | null;
};

export function CaseProvidersSection({ caseId }: { caseId: string }) {
  const [items, setItems] = useState<CaseProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProviderOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [detaching, setDetaching] = useState<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/providers");
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: CaseProviderItem[] };
    setItems(Array.isArray(data.items) ? data.items : []);
  }, [caseId]);

  useEffect(() => {
    loadProviders().finally(() => setLoading(false));
  }, [loadProviders]);

  useEffect(() => {
    if (!modalOpen) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch("/api/providers?q=" + encodeURIComponent(searchQuery.trim()));
        const data = (await res.json().catch(() => ({}))) as { items?: ProviderOption[] };
        const list = Array.isArray(data.items) ? data.items : [];
        setSearchResults(list);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [modalOpen, searchQuery]);

  const linkedIds = new Set(items.map((i) => i.providerId));
  const options = searchResults.filter((p) => !linkedIds.has(p.id));

  async function handleAttach(providerId: string) {
    setAttaching(true);
    try {
      const res = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, relationship: "treating" }),
      });
      if (res.ok) {
        setModalOpen(false);
        setSearchQuery("");
        setSearchResults([]);
        await loadProviders();
      }
    } finally {
      setAttaching(false);
    }
  }

  async function handleDetach(providerId: string) {
    setDetaching(providerId);
    try {
      const res = await fetch(
        `/api/cases/${encodeURIComponent(caseId)}/providers/${encodeURIComponent(providerId)}`,
        { method: "DELETE" }
      );
      if (res.ok) await loadProviders();
    } finally {
      setDetaching(null);
    }
  }

  if (loading) {
    return (
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Providers</h2>
        <p style={{ color: "#666", fontSize: 14 }}>Loading…</p>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Providers</h2>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        Attach providers to this case. Use &quot;Request Records&quot; to create a records request letter.
      </p>

      {items.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>No providers attached yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px 0" }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                marginBottom: 8,
                border: "1px solid #e5e5e5",
                borderRadius: 8,
                background: "#fafafa",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.provider.name}</div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {item.provider.city}, {item.provider.state}
                  {item.relationship !== "treating" && (
                    <span style={{ marginLeft: 8, textTransform: "capitalize" }}>({item.relationship})</span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Link
                  href={`/cases/${caseId}/records-requests/new?providerId=${encodeURIComponent(item.providerId)}`}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Request Records
                </Link>
                <button
                  type="button"
                  onClick={() => handleDetach(item.providerId)}
                  disabled={detaching === item.providerId}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    background: "#fff",
                    color: "#666",
                    fontSize: 13,
                    cursor: detaching === item.providerId ? "not-allowed" : "pointer",
                  }}
                >
                  {detaching === item.providerId ? "Detaching…" : "Detach"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Attach provider
        </button>
      </div>

      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              minWidth: 400,
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflow: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Attach provider</h3>
            <input
              type="text"
              placeholder="Search by name, city, specialty…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontSize: 14,
                marginBottom: 16,
              }}
            />
            {searching && <p style={{ color: "#666", fontSize: 13, marginBottom: 12 }}>Searching…</p>}
            {!searchQuery.trim() && (
              <p style={{ color: "#888", fontSize: 13, marginBottom: 12 }}>Type to search providers.</p>
            )}
            {searchQuery.trim() && !searching && options.length === 0 && (
              <p style={{ color: "#666", fontSize: 13, marginBottom: 12 }}>No providers found.</p>
            )}
            {options.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {options.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      marginBottom: 6,
                      border: "1px solid #eee",
                      borderRadius: 6,
                      background: "#fafafa",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {p.city}, {p.state}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAttach(p.id)}
                      disabled={attaching}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: "1px solid #111",
                        background: "#111",
                        color: "#fff",
                        fontSize: 13,
                        cursor: attaching ? "not-allowed" : "pointer",
                      }}
                    >
                      {attaching ? "Attaching…" : "Attach"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  background: "#fff",
                  color: "#666",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <p style={{ color: "#666", fontSize: 13 }}>
        <Link href="/providers" style={{ color: "#06c", textDecoration: "underline" }}>
          Manage providers
        </Link>{" "}
        in your directory.
      </p>
    </section>
  );
}
