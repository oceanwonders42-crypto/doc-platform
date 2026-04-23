"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getApiBase,
  getFetchOptions,
  getStoredToken,
  parseJsonResponse,
} from "@/lib/api";
import CaseHubTabs from "./CaseHubTabs";

type CaseFeatures = {
  demand_narratives: boolean;
  case_insights: boolean;
  insurance_extraction: boolean;
  court_extraction: boolean;
};

type CaseCounts = {
  documents: number;
  timeline: number;
  providers: number;
  requests: number;
  notes: number;
  tasks: number;
};

const DEFAULT_FEATURES: CaseFeatures = {
  demand_narratives: false,
  case_insights: false,
  insurance_extraction: false,
  court_extraction: false,
};

const DEFAULT_COUNTS: CaseCounts = {
  documents: 0,
  timeline: 0,
  providers: 0,
  requests: 0,
  notes: 0,
  tasks: 0,
};

async function readTimelineMeta(
  caseId: string
): Promise<{ lastRebuiltAt: string | null }> {
  const response = await fetch(`/api/cases/${caseId}/timeline-meta`, {
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return { lastRebuiltAt: null };
  const data = (await response.json().catch(() => ({}))) as {
    lastRebuiltAt?: string | null;
  };
  return { lastRebuiltAt: data.lastRebuiltAt ?? null };
}

async function readListCount(
  url: string,
  headers: Record<string, string>
): Promise<number> {
  const response = await fetch(url, {
    headers,
    ...getFetchOptions(),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return 0;
  const data = (await response.json().catch(() => ({}))) as {
    items?: unknown[];
  };
  return Array.isArray(data.items) ? data.items.length : 0;
}

function getSessionAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function CasePageClient({ caseId }: { caseId: string }) {
  const [firmId, setFirmId] = useState<string | null>(null);
  const [timelineMeta, setTimelineMeta] = useState<{
    lastRebuiltAt: string | null;
  }>({
    lastRebuiltAt: null,
  });
  const [features, setFeatures] = useState<CaseFeatures>(DEFAULT_FEATURES);
  const [counts, setCounts] = useState<CaseCounts>(DEFAULT_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const base = getApiBase();
      const headers = getSessionAuthHeader();
      if (!base || !headers.Authorization) {
        if (!cancelled) setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [
          usageData,
          featureData,
          nextTimelineMeta,
          documentCount,
          timelineCount,
          providerCount,
          requestCount,
          noteCount,
          taskCount,
        ] = await Promise.all([
          fetch(`${base}/me/usage`, {
            headers,
            ...getFetchOptions(),
            cache: "no-store",
          })
            .then(parseJsonResponse)
            .catch(() => ({})),
          fetch("/api/me/features", {
            headers,
            ...getFetchOptions(),
            cache: "no-store",
          })
            .then(parseJsonResponse)
            .catch(() => DEFAULT_FEATURES),
          readTimelineMeta(caseId),
          readListCount(`${base}/cases/${caseId}/documents`, headers),
          readListCount(`${base}/cases/${caseId}/timeline`, headers),
          readListCount(`${base}/cases/${caseId}/providers`, headers),
          readListCount(`${base}/cases/${caseId}/records-requests`, headers),
          readListCount(`${base}/cases/${caseId}/notes`, headers),
          readListCount(`${base}/cases/${caseId}/tasks`, headers),
        ]);

        if (cancelled) return;

        const usage = usageData as { firm?: { id?: string } };
        const featurePayload = featureData as Partial<CaseFeatures>;

        setFirmId(usage.firm?.id ?? null);
        setFeatures({
          demand_narratives: Boolean(featurePayload.demand_narratives),
          case_insights: Boolean(featurePayload.case_insights),
          insurance_extraction: Boolean(featurePayload.insurance_extraction),
          court_extraction: Boolean(featurePayload.court_extraction),
        });
        setTimelineMeta(nextTimelineMeta);
        setCounts({
          documents: documentCount,
          timeline: timelineCount,
          providers: providerCount,
          requests: requestCount,
          notes: noteCount,
          tasks: taskCount,
        });
      } catch (loadError) {
        if (cancelled) return;
        setError(getErrorMessage(loadError, "Failed to load case hub."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Case Hub
      </h1>
      <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
        Case {caseId}
      </p>

      {error && (
        <p style={{ color: "#c00", fontSize: 14, marginBottom: 16 }}>{error}</p>
      )}
      {loading && (
        <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
          Loading case hub...
        </p>
      )}

      <CaseHubTabs
        caseId={caseId}
        firmId={firmId}
        timelineMeta={timelineMeta}
        features={features}
        counts={counts}
      />

      <section
        style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12 }}
      >
        <Link
          href={`/cases/${caseId}/offers`}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Settlement Offers
        </Link>
        {features.demand_narratives && (
          <Link
            href={`/cases/${caseId}/narrative`}
            style={{
              display: "inline-block",
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fff",
              color: "#111",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Demand Narrative
          </Link>
        )}
        <Link
          href={`/cases/${caseId}/timeline`}
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            color: "#111",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Full Timeline
        </Link>
      </section>
    </main>
  );
}
