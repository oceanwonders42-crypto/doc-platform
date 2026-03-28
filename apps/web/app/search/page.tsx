"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";

type SearchResult = {
  ok: boolean;
  cases: { count: number; items: { id: string; title: string | null; caseNumber: string | null; clientName: string | null }[] };
  documents: { count: number; items: { id: string; originalName: string; routedCaseId: string | null }[] };
  providers: { count: number; items: { id: string; name: string; city: string; state: string; specialty: string | null }[] };
  recordsRequests: { count: number; items: { id: string; providerName: string; status: string; caseId: string }[] };
  notes?: { count: number; items: { id: string; body: string; caseId: string }[] };
  tasks?: { count: number; items: { id: string; title: string; caseId: string; completedAt: string | null }[] };
};

function Section<T extends { id: string }>({
  title,
  count,
  items,
  renderLink,
  emptyMsg,
}: {
  title: string;
  count: number;
  items: T[];
  renderLink: (item: T) => { href: string; label: string };
  emptyMsg?: string;
}) {
  if (count === 0 && items.length === 0) return null;
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
        {title} ({count})
      </h2>
      {items.length === 0 ? (
        <p style={{ color: "#666", fontSize: 14 }}>{emptyMsg ?? "No results."}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => {
            const { href, label } = renderLink(item);
            return (
              <li key={item.id} style={{ marginBottom: 6 }}>
                <Link href={href} style={{ color: "#06c", textDecoration: "underline", fontSize: 14 }}>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const q = searchParams?.get("q") ?? "";
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    if (!q.trim()) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&includeNotes=true&includeTasks=true`);
      const json = (await res.json()) as SearchResult;
      if (!res.ok) {
        setError((json as { error?: string }).error ?? `HTTP ${res.status}`);
        return;
      }
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const total =
    data?.ok
      ? (data.cases?.count ?? 0) +
        (data.documents?.count ?? 0) +
        (data.providers?.count ?? 0) +
        (data.recordsRequests?.count ?? 0) +
        (data.notes?.count ?? 0) +
        (data.tasks?.count ?? 0)
      : 0;

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Search</h1>
      <form
        method="get"
        action="/search"
        style={{ marginBottom: 24, display: "flex", gap: 8 }}
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search cases, documents, providers, records requests…"
          style={{
            flex: 1,
            padding: "10px 14px",
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 18px",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </form>

      {loading && <p style={{ color: "#666", marginBottom: 16 }}>Loading…</p>}
      {error && <p style={{ color: "#c00", marginBottom: 16 }}>{error}</p>}

      {!loading && !error && q.trim() && data?.ok && (
        <>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
            {total} result{total !== 1 ? "s" : ""} for &quot;{q}&quot;
          </p>

          <Section
            title="Cases"
            count={data.cases.count}
            items={data.cases.items}
            renderLink={(c) => ({
              href: `/cases/${c.id}`,
              label: [c.clientName, c.caseNumber, c.title].filter(Boolean).join(" • ") || c.id,
            })}
          />
          <Section
            title="Documents"
            count={data.documents.count}
            items={data.documents.items}
            renderLink={(d) => ({
              href: `/documents/${d.id}`,
              label: d.originalName,
            })}
          />
          <Section
            title="Providers"
            count={data.providers.count}
            items={data.providers.items}
            renderLink={(p) => ({
              href: `/providers/${p.id}`,
              label: `${p.name}${p.city || p.state ? ` • ${[p.city, p.state].filter(Boolean).join(", ")}` : ""}${p.specialty ? ` • ${p.specialty}` : ""}`,
            })}
          />
          <Section
            title="Records requests"
            count={data.recordsRequests.count}
            items={data.recordsRequests.items}
            renderLink={(r) => ({
              href: `/records-requests/${r.id}`,
              label: `${r.providerName} (${r.status})`,
            })}
          />
          {data.notes && (
            <Section
              title="Notes"
              count={data.notes.count}
              items={data.notes.items}
              renderLink={(n) => ({
                href: `/cases/${n.caseId}`,
                label: n.body.slice(0, 80) + (n.body.length > 80 ? "…" : ""),
              })}
            />
          )}
          {data.tasks && (
            <Section
              title="Tasks"
              count={data.tasks.count}
              items={data.tasks.items}
              renderLink={(t) => ({
                href: `/cases/${t.caseId}`,
                label: `${t.title}${t.completedAt ? " ✓" : ""}`,
              })}
            />
          )}
        </>
      )}

      {!loading && !error && q.trim() && !data?.ok && (
        <p style={{ color: "#666" }}>No results found.</p>
      )}

      {!q.trim() && (
        <p style={{ color: "#888", fontSize: 14 }}>Enter a search term above.</p>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>Loading…</main>}>
      <SearchPageContent />
    </Suspense>
  );
}
