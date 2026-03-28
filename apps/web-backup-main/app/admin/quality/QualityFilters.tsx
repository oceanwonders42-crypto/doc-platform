"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Firm = { id: string; name: string };

export default function QualityFilters({ firms }: { firms: Firm[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const firmId = searchParams.get("firmId") ?? "";
  const groupBy = searchParams.get("groupBy") ?? "";

  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/admin/quality?${next.toString()}`);
  };

  return (
    <section
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        background: "#fafafa",
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Filters</h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span style={{ color: "#666" }}>From date</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value })}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              minWidth: 140,
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span style={{ color: "#666" }}>To date</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value })}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              minWidth: 140,
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span style={{ color: "#666" }}>Firm</span>
          <select
            value={firmId}
            onChange={(e) => updateParams({ firmId: e.target.value })}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              minWidth: 200,
            }}
          >
            <option value="">All firms</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span style={{ color: "#666" }}>Group by</span>
          <select
            value={groupBy}
            onChange={(e) => updateParams({ groupBy: e.target.value })}
            style={{
              padding: "6px 10px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 6,
              minWidth: 100,
            }}
          >
            <option value="">—</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => router.push("/admin/quality")}
          style={{
            padding: "6px 12px",
            fontSize: 14,
            border: "1px solid #999",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>
    </section>
  );
}
