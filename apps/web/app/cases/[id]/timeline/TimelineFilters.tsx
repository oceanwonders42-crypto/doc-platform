"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  caseId: string;
  currentTrack: string;
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
};

export default function TimelineFilters({
  caseId,
  currentTrack,
  dateFrom = "",
  dateTo = "",
  provider = "",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const params = new URLSearchParams();
    const t = fd.get("track") as string;
    if (t && t !== "all") params.set("track", t);
    const df = (fd.get("dateFrom") as string)?.trim();
    if (df) params.set("dateFrom", df);
    const dt = (fd.get("dateTo") as string)?.trim();
    if (dt) params.set("dateTo", dt);
    const p = (fd.get("provider") as string)?.trim();
    if (p) params.set("provider", p);
    const q = params.toString();
    router.push(q ? `/cases/${caseId}/timeline?${q}` : `/cases/${caseId}/timeline`);
  }

  const hasFilters = dateFrom || dateTo || provider;

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-end",
        marginTop: 12,
        padding: "12px 16px",
        background: "#f9f9f9",
        borderRadius: 8,
        border: "1px solid #eee",
      }}
    >
      <input type="hidden" name="track" value={currentTrack} />
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#555" }}>
        From
        <input
          type="date"
          name="dateFrom"
          defaultValue={dateFrom}
          style={{ padding: "6px 10px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6 }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#555" }}>
        To
        <input
          type="date"
          name="dateTo"
          defaultValue={dateTo}
          style={{ padding: "6px 10px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6 }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#555" }}>
        Provider
        <input
          type="text"
          name="provider"
          placeholder="Filter by provider"
          defaultValue={provider}
          style={{ padding: "6px 10px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6, minWidth: 160 }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="submit"
          style={{
            padding: "6px 14px",
            fontSize: 14,
            border: "1px solid #333",
            borderRadius: 6,
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Apply filters
        </button>
        {hasFilters && (
          <a
            href={`/cases/${caseId}/timeline${currentTrack !== "all" ? `?track=${currentTrack}` : ""}`}
            style={{ fontSize: 13, color: "#666", textDecoration: "underline" }}
          >
            Clear filters
          </a>
        )}
      </div>
    </form>
  );
}
