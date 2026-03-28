"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreatedCounts = {
  firms?: number;
  cases?: number;
  documents?: number;
  timelineEvents?: number;
};

type Result = {
  ok?: boolean;
  dryRun?: boolean;
  wouldCreate?: CreatedCounts;
  created?: CreatedCounts;
  firmId?: string;
  caseIds?: string[];
  documentIds?: string[];
  error?: string;
};

export default function DemoSeedClient() {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function runSeed(dryRun: boolean) {
    const setLoader = dryRun ? setPreviewLoading : setLoading;
    setLoader(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/demo/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = (await res.json().catch(() => ({}))) as Result & { error?: string };
      if (res.ok && data.ok) {
        setResult(data);
        if (!dryRun) {
          router.refresh();
        }
      } else {
        setError(data.error || `Request failed (${res.status})`);
        setResult(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setResult(null);
    } finally {
      setLoader(false);
    }
  }

  return (
    <section
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 20,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => runSeed(false)}
          disabled={loading}
          style={{
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            border: "1px solid #111",
            borderRadius: 8,
            background: loading ? "#eee" : "#111",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Seeding…" : "Seed demo data"}
        </button>
        <button
          type="button"
          onClick={() => runSeed(true)}
          disabled={previewLoading}
          style={{
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 600,
            border: "1px solid #333",
            borderRadius: 8,
            background: "#fff",
            color: "#111",
            cursor: previewLoading ? "not-allowed" : "pointer",
          }}
        >
          {previewLoading ? "Checking…" : "Preview (dry run)"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "#ffebee",
            borderRadius: 8,
            fontSize: 14,
            color: "#b71c1c",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: 12,
            background: result.ok ? "#e8f5e9" : "#ffebee",
            borderRadius: 8,
            fontSize: 14,
          }}
        >
          {result.dryRun ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Dry run — would create:</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {(result.wouldCreate?.firms ?? 0) > 0 && <li>Firms: {result.wouldCreate?.firms}</li>}
                <li>Cases: {result.wouldCreate?.cases ?? 0}</li>
                <li>Documents: {result.wouldCreate?.documents ?? 0}</li>
                <li>Timeline events: {result.wouldCreate?.timelineEvents ?? 0}</li>
              </ul>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#2e7d32" }}>Demo data seeded.</div>
              <ul style={{ margin: 0, paddingLeft: 20, color: "#1b5e20" }}>
                <li>Cases: {result.created?.cases ?? 0}</li>
                <li>Documents: {result.created?.documents ?? 0}</li>
                <li>Timeline events: {result.created?.timelineEvents ?? 0}</li>
              </ul>
              {result.firmId && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
                  Firm ID: <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>{result.firmId}</code>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
