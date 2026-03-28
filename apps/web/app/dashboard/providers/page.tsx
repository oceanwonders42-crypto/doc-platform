"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable, Column } from "@/components/dashboard/DataTable";

type Provider = {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  specialty: string | null;
};

type ProvidersListResponse = { items?: Provider[]; error?: string };

function isProvidersListResponse(res: unknown): res is ProvidersListResponse {
  return typeof res === "object" && res !== null;
}

export default function ProvidersPage() {
  const [items, setItems] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const base = getApiBase();
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());

    setLoading(true);
    setError(null);

    fetch(`${base}/providers?${params.toString()}`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isProvidersListResponse(res) && Array.isArray(res.items)) {
          setItems(res.items);
          return;
        }
        setItems([]);
        setError(isProvidersListResponse(res) ? res.error ?? "Failed to load providers" : "Failed to load providers");
      })
      .catch((e) => {
        setItems([]);
        setError(e?.message ?? "Request failed");
      })
      .finally(() => setLoading(false));
  }, [search]);

  const columns: Column<Provider>[] = [
    {
      key: "name",
      header: "Provider",
      render: (row) => (
        <Link href={`/dashboard/providers/${row.id}`} className="onyx-link" style={{ fontWeight: 500 }}>
          {row.name ?? row.id}
        </Link>
      ),
    },
    { key: "specialty", header: "Specialty", render: (row) => row.specialty ?? "-" },
    { key: "city", header: "City", render: (row) => [row.city, row.state].filter(Boolean).join(", ") || "-" },
    { key: "phone", header: "Phone", render: (row) => row.phone ?? "-" },
    {
      key: "action",
      header: "",
      render: (row) => (
        <Link href={`/dashboard/providers/${row.id}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
          Manage
        </Link>
      ),
    },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Providers" }]}
        title="Provider directory"
        description="Healthcare providers linked to your cases and records-request workflows"
        action={
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="search"
              placeholder="Search providers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 220 }}
            />
            <Link href="/dashboard/providers/new" className="onyx-btn-primary" style={{ textDecoration: "none" }}>
              Add provider
            </Link>
          </div>
        }
      />

      {error && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading...</p>
      ) : items.length === 0 && !error ? (
        <div className="onyx-card" style={{ padding: "2.5rem", textAlign: "center", maxWidth: "32rem" }}>
          <p style={{ margin: 0, fontSize: "1rem", fontWeight: 500, color: "var(--onyx-text)" }}>No providers yet</p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
            Add providers here so operators can manage contact info, link cases, and start records-request workflows from the active app.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center", marginTop: "1.25rem" }}>
            <Link href="/dashboard/providers/new" className="onyx-btn-primary" style={{ textDecoration: "none" }}>
              Add provider
            </Link>
            <Link href="/dashboard/records-requests/new" className="onyx-btn-secondary" style={{ textDecoration: "none" }}>
              New records request
            </Link>
          </div>
        </div>
      ) : (
        <div className="onyx-card" style={{ overflow: "hidden" }}>
          <DataTable columns={columns} data={items} emptyMessage="No providers found." />
        </div>
      )}
    </div>
  );
}
