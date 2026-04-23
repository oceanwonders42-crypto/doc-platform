"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";

type FirmRow = {
  firmId: string;
  firmName: string;
  status: string;
  plan: string;
  pageLimitMonthly: number;
  createdAt: string;
  documentsProcessed?: number;
  activeUsers?: number;
  usageStats?: {
    documentsProcessed: number;
    narrativeGenerated: number;
    pagesProcessed: number;
  };
};

type AdminFirmsResponse = {
  ok: boolean;
  firms: FirmRow[];
  error?: string;
};

function isAdminFirmsResponse(data: unknown): data is AdminFirmsResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "ok" in data &&
    "firms" in data &&
    Array.isArray((data as { firms?: unknown }).firms)
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AdminFirmsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firms, setFirms] = useState<FirmRow[]>([]);

  const loadFirms = useCallback(async () => {
    const authHeader = getAuthHeader();
    if (!authHeader.Authorization) {
      setAuthorized(false);
      setAuthChecked(true);
      setLoading(false);
      router.replace("/login");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/firms", {
        headers: authHeader,
        ...getFetchOptions(),
        cache: "no-store",
      });

      if (response.status === 401) {
        setAuthorized(false);
        setAuthChecked(true);
        setLoading(false);
        router.replace("/login");
        return;
      }

      if (response.status === 403) {
        setAuthorized(false);
        setAuthChecked(true);
        setLoading(false);
        router.replace("/dashboard");
        return;
      }

      const responseData = await parseJsonResponse(response);
      setAuthChecked(true);
      setAuthorized(true);

      if (!response.ok || !isAdminFirmsResponse(responseData) || !responseData.ok) {
        setError(
          isAdminFirmsResponse(responseData)
            ? (responseData.error ?? `HTTP ${response.status}`)
            : `HTTP ${response.status}`
        );
        setLoading(false);
        return;
      }

      setFirms(responseData.firms);
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, "Failed to load platform firms."));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadFirms();
  }, [loadFirms]);

  if (!authChecked || loading) {
    return (
      <main
        style={{
          padding: 24,
          maxWidth: 1100,
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system",
        }}
      >
        <p style={{ color: "#666", margin: 0 }}>Loading firms...</p>
      </main>
    );
  }

  if (!authorized) {
    return null;
  }

  if (error) {
    return (
      <main
        style={{
          padding: 24,
          maxWidth: 1100,
          margin: "0 auto",
          fontFamily: "system-ui, -apple-system",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
            {"<-"} Admin
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Platform firms</h1>
        </div>
        <p style={{ color: "#c00" }}>{error}</p>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Link href="/admin/debug" style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          {"<-"} Admin
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Platform firms</h1>
        <Link
          href="/onboarding"
          style={{
            marginLeft: "auto",
            padding: "8px 14px",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          New firm
        </Link>
      </div>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        All firms. Click a firm for details, users, API keys, and usage.
      </p>

      <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f9f9f9", textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "12px 10px" }}>Firm</th>
              <th style={{ padding: "12px 10px" }}>Status</th>
              <th style={{ padding: "12px 10px" }}>Plan</th>
              <th style={{ padding: "12px 10px" }}>Page limit</th>
              <th style={{ padding: "12px 10px" }}>Created</th>
              <th style={{ padding: "12px 10px" }}>Pages (usage)</th>
              <th style={{ padding: "12px 10px" }}></th>
            </tr>
          </thead>
          <tbody>
            {firms.map((firm) => (
              <tr key={firm.firmId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "10px" }}>
                  <span style={{ fontWeight: 600 }}>{firm.firmName}</span>
                  <div style={{ fontSize: 12, color: "#888" }}>{firm.firmId}</div>
                </td>
                <td style={{ padding: "10px" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 12,
                      background: firm.status === "active" ? "#e8f5e9" : "#fff3e0",
                      color: firm.status === "active" ? "#2e7d32" : "#e65100",
                    }}
                  >
                    {firm.status}
                  </span>
                </td>
                <td style={{ padding: "10px" }}>{firm.plan}</td>
                <td style={{ padding: "10px" }}>{firm.pageLimitMonthly.toLocaleString()}</td>
                <td style={{ padding: "10px" }}>{formatDate(firm.createdAt)}</td>
                <td style={{ padding: "10px" }}>
                  {(firm.usageStats?.pagesProcessed ?? 0).toLocaleString()}
                </td>
                <td style={{ padding: "10px" }}>
                  <Link
                    href={`/admin/firms/${firm.firmId}`}
                    style={{ fontSize: 13, color: "#1565c0", textDecoration: "underline" }}
                  >
                    View {"->"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {firms.length === 0 && (
        <p style={{ padding: 16, color: "#666", margin: 0 }}>No firms yet.</p>
      )}
    </main>
  );
}
