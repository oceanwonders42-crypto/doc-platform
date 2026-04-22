"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/contexts/I18nContext";
import { getApiBase, getAuthHeader, parseJsonResponse } from "@/lib/api";
import { isTrafficFeatureEnabled } from "@/lib/devFeatures";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type TrafficMatterItem = {
  id: string;
  defendantName: string | null;
  defendantDob: string | null;
  citationNumber: string | null;
  statuteCodeRaw: string | null;
  statuteCodeNormalized: string | null;
  chargeDescriptionRaw: string | null;
  chargeListJson: unknown;
  jurisdictionState: string | null;
  jurisdictionCounty: string | null;
  courtName: string | null;
  courtType: string | null;
  issueDate: string | null;
  dueDate: string | null;
  hearingDate: string | null;
  status: string;
  documentTypeOfOrigin: string | null;
  sourceDocumentId: string | null;
  extractedFactsJson: unknown;
  extractionConfidenceJson: Record<string, number> | null;
  routingConfidence: number | null;
  reviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
};

type TrafficDetailResponse = { ok?: boolean; item?: TrafficMatterItem };

function isTrafficDetailResponse(res: unknown): res is TrafficDetailResponse {
  return typeof res === "object" && res !== null;
}

export default function TrafficDetailPage() {
  const router = useRouter();
  const { t } = useI18n();
  const trafficEnabled = isTrafficFeatureEnabled();
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [item, setItem] = useState<TrafficMatterItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trafficEnabled) {
      router.replace("/dashboard");
      return;
    }
    if (!id) return;
    const base = getApiBase();
    fetch(`${base}/traffic/${id}`, { headers: { ...getAuthHeader(), Accept: "application/json" } })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isTrafficDetailResponse(res) && res.ok && res.item) setItem(res.item);
        else setError("Traffic matter not found");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, [id, router, trafficEnabled]);

  if (!trafficEnabled) return null;

  if (loading) {
    return (
      <div style={{ padding: "0 1.5rem 1.5rem" }}>
        <PageHeader breadcrumbs={[{ label: t("nav.traffic") }, { label: "…" }]} title="…" />
        <p style={{ color: "var(--onyx-text-muted)" }}>{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div style={{ padding: "0 1.5rem 1.5rem" }}>
        <PageHeader breadcrumbs={[{ label: t("nav.traffic") }, { label: "Detail" }]} title="Traffic matter" />
        <div className="onyx-card" style={{ padding: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error ?? "Not found"}</p>
          <Link href="/dashboard/traffic" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem" }}>
            Back to Traffic
          </Link>
        </div>
      </div>
    );
  }

  const confidence = (item.extractionConfidenceJson as Record<string, number>) ?? {};
  const formatDate = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[
          { label: t("nav.traffic"), href: "/dashboard/traffic" },
          { label: item.citationNumber ?? item.defendantName ?? item.id },
        ]}
        title={item.defendantName ?? "Traffic matter"}
        description={item.citationNumber ? `Citation ${item.citationNumber}` : "Traffic citation matter"}
      />

      {item.reviewRequired && (
        <div
          className="onyx-card"
          style={{
            padding: "1rem",
            marginBottom: "1rem",
            borderLeft: "4px solid var(--onyx-warning)",
            background: "var(--onyx-warning-muted)",
          }}
        >
          <strong>Review required</strong>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Some fields were uncertain or missing. Please verify extracted data before using for recommendations or filing.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        <DashboardCard title="Matter summary">
          <dl style={{ margin: 0, display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Status</dt>
              <dd style={{ margin: 0 }}>{item.status}</dd>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Document type</dt>
              <dd style={{ margin: 0 }}>{item.documentTypeOfOrigin ?? "—"}</dd>
            </div>
            {item.sourceDocumentId && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Source document</dt>
                <dd style={{ margin: 0 }}>
                  <Link href={`/dashboard/documents/${item.sourceDocumentId}`} className="onyx-link" style={{ fontSize: "0.875rem" }}>
                    View document
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </DashboardCard>

        <DashboardCard title="Extracted fields">
          <dl style={{ margin: 0, display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Defendant</dt><dd style={{ margin: "0.15rem 0 0" }}>{item.defendantName ?? "—"}</dd></div>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Citation #</dt><dd style={{ margin: "0.15rem 0 0" }}>{item.citationNumber ?? "—"}</dd></div>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>State</dt><dd style={{ margin: "0.15rem 0 0" }}>{item.jurisdictionState ?? "—"}</dd></div>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>County</dt><dd style={{ margin: "0.15rem 0 0" }}>{item.jurisdictionCounty ?? "—"}</dd></div>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Court</dt><dd style={{ margin: "0.15rem 0 0" }}>{item.courtName ?? "—"}</dd></div>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Issue date</dt><dd style={{ margin: "0.15rem 0 0" }}>{formatDate(item.issueDate)}</dd></div>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Due date</dt><dd style={{ margin: "0.15rem 0 0" }}>{formatDate(item.dueDate)}</dd></div>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Hearing date</dt><dd style={{ margin: "0.15rem 0 0" }}>{formatDate(item.hearingDate)}</dd></div>
            {item.chargeDescriptionRaw && (
              <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Charge</dt><dd style={{ margin: "0.15rem 0 0" }}>{item.chargeDescriptionRaw}</dd></div>
            )}
          </dl>
        </DashboardCard>

        <DashboardCard title="Statute / code">
          <dl style={{ margin: 0, display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Raw</dt><dd style={{ margin: "0.15rem 0 0", fontFamily: "monospace" }}>{item.statuteCodeRaw ?? "—"}</dd></div>
            <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Normalized</dt><dd style={{ margin: "0.15rem 0 0", fontFamily: "monospace" }}>{item.statuteCodeNormalized ?? "—"}</dd></div>
          </dl>
        </DashboardCard>

        <DashboardCard title="Confidence">
          <dl style={{ margin: 0, display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
            {item.routingConfidence != null && (
              <div><dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Routing</dt><dd style={{ margin: "0.15rem 0 0" }}>{(item.routingConfidence * 100).toFixed(0)}%</dd></div>
            )}
            {Object.entries(confidence).length > 0 &&
              Object.entries(confidence).map(([key, val]) => (
                <div key={key}>
                  <dt style={{ margin: 0, color: "var(--onyx-text-muted)" }}>{key}</dt>
                  <dd style={{ margin: "0.15rem 0 0" }}>{(val * 100).toFixed(0)}%</dd>
                </div>
              ))}
            {Object.keys(confidence).length === 0 && item.routingConfidence == null && (
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>No confidence data</p>
            )}
          </dl>
        </DashboardCard>
      </div>
    </div>
  );
}
