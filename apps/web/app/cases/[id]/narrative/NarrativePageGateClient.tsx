"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getFetchOptions,
  getStoredToken,
  parseJsonResponse,
} from "@/lib/api";
import NarrativePageClient from "./NarrativeClient";

function getSessionAuthHeader(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function NarrativePageGateClient({
  caseId,
}: {
  caseId: string;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const headers = getSessionAuthHeader();
      if (!headers.Authorization) {
        if (!cancelled) setEnabled(false);
        return;
      }

      try {
        const response = await fetch("/api/me/features", {
          headers,
          ...getFetchOptions(),
          cache: "no-store",
        });
        const data = (await parseJsonResponse(response)) as {
          demand_narratives?: unknown;
          error?: string;
        };

        if (cancelled) return;

        if (!response.ok) {
          setError(data.error ?? `HTTP ${response.status}`);
          setEnabled(false);
          return;
        }

        setEnabled(Boolean(data.demand_narratives));
      } catch (loadError) {
        if (cancelled) return;
        setError(getErrorMessage(loadError, "Failed to load feature access."));
        setEnabled(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled === null) {
    return (
      <main
        style={{
          padding: 24,
          maxWidth: 800,
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <Link
            href={`/cases/${caseId}`}
            style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}
          >
            {"<-"} Case {caseId}
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
            Demand Narrative Assistant
          </h1>
        </div>
        <p style={{ color: "#666", fontSize: 14, margin: 0 }}>
          Loading feature access...
        </p>
      </main>
    );
  }

  return (
    <>
      {error && (
        <main
          style={{
            padding: "24px 24px 0",
            maxWidth: 800,
            margin: "0 auto",
            fontFamily: "system-ui, -apple-system",
          }}
        >
          <p style={{ color: "#c00", fontSize: 14, margin: 0 }}>{error}</p>
        </main>
      )}
      <NarrativePageClient caseId={caseId} enabled={enabled} />
    </>
  );
}
