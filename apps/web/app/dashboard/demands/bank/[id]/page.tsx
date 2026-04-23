"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  formatApiClientError,
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";

type DemandBankDetail = {
  item: {
    id: string;
    matterId: string | null;
    sourceDocumentId: string | null;
    title: string;
    fileName: string | null;
    originalText: string;
    redactedText: string | null;
    summary: string | null;
    jurisdiction: string | null;
    caseType: string | null;
    liabilityType: string | null;
    injuryTags: string[];
    treatmentTags: string[];
    bodyPartTags: string[];
    mriPresent: boolean;
    injectionsPresent: boolean;
    surgeryPresent: boolean;
    treatmentDurationDays: number | null;
    totalBillsAmount: number | null;
    demandAmount: number | null;
    templateFamily: string | null;
    toneStyle: string | null;
    qualityScore: number | null;
    approvedForReuse: boolean;
    blockedForReuse: boolean;
    reviewStatus: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    sectionCount: number;
  };
  matter: {
    id: string;
    title: string | null;
    caseNumber: string | null;
    clientName: string | null;
    status: string | null;
  } | null;
  sourceDocument: {
    id: string;
    originalName: string | null;
    status: string;
    routedCaseId: string | null;
    ingestedAt: string;
  } | null;
  sections: Array<{
    id: string;
    sectionType: string;
    heading: string | null;
    originalText: string;
    redactedText: string | null;
    qualityScore: number | null;
    approvedForReuse: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  recentRuns: Array<{
    id: string;
    runType: string;
    createdAt: string;
    model: string | null;
    promptVersion: string | null;
    retrievalReasoning: unknown;
  }>;
};

function formatArray(value: string[]) {
  return value.length > 0 ? value.join(", ") : "—";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function DemandBankDetailPage() {
  const params = useParams<{ id: string }>();
  const demandBankId = typeof params?.id === "string" ? params.id : "";
  const [detail, setDetail] = useState<DemandBankDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [redactedText, setRedactedText] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [caseType, setCaseType] = useState("");
  const [liabilityType, setLiabilityType] = useState("");
  const [templateFamily, setTemplateFamily] = useState("");
  const [toneStyle, setToneStyle] = useState("");
  const [injuryTags, setInjuryTags] = useState("");
  const [treatmentTags, setTreatmentTags] = useState("");
  const [bodyPartTags, setBodyPartTags] = useState("");
  const [qualityScore, setQualityScore] = useState("");
  const [reviewStatus, setReviewStatus] = useState("pending");
  const [approvedForReuse, setApprovedForReuse] = useState(false);
  const [blockedForReuse, setBlockedForReuse] = useState(false);

  const load = useCallback(async () => {
    if (!demandBankId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiBase()}/demand-bank/${demandBankId}`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const payload = (await parseJsonResponse(response)) as DemandBankDetail & {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || payload.ok === false || !payload.item) {
        throw new Error(payload.error ?? "Failed to load demand bank document.");
      }
      setDetail(payload);
      setTitle(payload.item.title);
      setSummary(payload.item.summary ?? "");
      setRedactedText(payload.item.redactedText ?? "");
      setJurisdiction(payload.item.jurisdiction ?? "");
      setCaseType(payload.item.caseType ?? "");
      setLiabilityType(payload.item.liabilityType ?? "");
      setTemplateFamily(payload.item.templateFamily ?? "");
      setToneStyle(payload.item.toneStyle ?? "");
      setInjuryTags(payload.item.injuryTags.join(", "));
      setTreatmentTags(payload.item.treatmentTags.join(", "));
      setBodyPartTags(payload.item.bodyPartTags.join(", "));
      setQualityScore(payload.item.qualityScore != null ? String(payload.item.qualityScore) : "");
      setReviewStatus(payload.item.reviewStatus);
      setApprovedForReuse(payload.item.approvedForReuse);
      setBlockedForReuse(payload.item.blockedForReuse);
    } catch (requestError) {
      setError(formatApiClientError(requestError, "Failed to load demand bank document."));
    } finally {
      setLoading(false);
    }
  }, [demandBankId]);

  useEffect(() => {
    void load();
  }, [load]);

  const derivedSignals = useMemo(() => {
    if (!detail) return [];
    const values: string[] = [];
    if (detail.item.mriPresent) values.push("MRI");
    if (detail.item.injectionsPresent) values.push("Injections");
    if (detail.item.surgeryPresent) values.push("Surgery");
    return values;
  }, [detail]);

  async function saveReviewState(overrides?: Partial<{ approvedForReuse: boolean; blockedForReuse: boolean; reviewStatus: string }>) {
    if (!demandBankId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${getApiBase()}/demand-bank/${demandBankId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        ...getFetchOptions(),
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim() || null,
          redactedText: redactedText.trim() || null,
          jurisdiction: jurisdiction.trim() || null,
          caseType: caseType.trim() || null,
          liabilityType: liabilityType.trim() || null,
          templateFamily: templateFamily.trim() || null,
          toneStyle: toneStyle.trim() || null,
          injuryTags: injuryTags.split(",").map((item) => item.trim()).filter(Boolean),
          treatmentTags: treatmentTags.split(",").map((item) => item.trim()).filter(Boolean),
          bodyPartTags: bodyPartTags.split(",").map((item) => item.trim()).filter(Boolean),
          qualityScore: qualityScore.trim() ? Number(qualityScore) : null,
          reviewStatus: overrides?.reviewStatus ?? reviewStatus,
          approvedForReuse: overrides?.approvedForReuse ?? approvedForReuse,
          blockedForReuse: overrides?.blockedForReuse ?? blockedForReuse,
        }),
      });
      const payload = (await parseJsonResponse(response)) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error ?? "Failed to save demand bank document.");
      }
      setSuccess("Demand bank review details saved.");
      await load();
    } catch (requestError) {
      setError(formatApiClientError(requestError, "Failed to save demand bank document."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "0 1.5rem 1.5rem" }}>
        <PageHeader
          breadcrumbs={[{ label: "Demands", href: "/dashboard/demands" }, { label: "Demand Bank", href: "/dashboard/demands/bank" }, { label: "…" }]}
          title="Demand Bank"
          description="Loading demand bank document…"
        />
      </div>
    );
  }

  if (!detail) {
    return (
      <div style={{ padding: "0 1.5rem 1.5rem" }}>
        <PageHeader
          breadcrumbs={[{ label: "Demands", href: "/dashboard/demands" }, { label: "Demand Bank", href: "/dashboard/demands/bank" }]}
          title="Demand Bank"
          description="Demand bank document unavailable."
        />
        {error && <p style={{ color: "var(--onyx-error)" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Demands", href: "/dashboard/demands" },
          { label: "Demand Bank", href: "/dashboard/demands/bank" },
          { label: detail.item.title },
        ]}
        title={detail.item.title}
        description="Review reusable metadata, approve or block reuse, and inspect extracted sections before the bank feeds future demand drafting."
        action={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="onyx-btn-secondary" onClick={() => void saveReviewState({ approvedForReuse: false, blockedForReuse: false, reviewStatus: "pending" })} disabled={saving}>
              Mark pending
            </button>
            <button type="button" className="onyx-btn-secondary" onClick={() => void saveReviewState({ approvedForReuse: true, blockedForReuse: false, reviewStatus: "approved" })} disabled={saving}>
              Approve for reuse
            </button>
            <button type="button" className="onyx-btn-secondary" onClick={() => void saveReviewState({ approvedForReuse: false, blockedForReuse: true, reviewStatus: "blocked" })} disabled={saving}>
              Block reuse
            </button>
          </div>
        }
      />

      {error && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
        </div>
      )}

      {success && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-success)" }}>
          <p style={{ margin: 0, color: "var(--onyx-success)" }}>{success}</p>
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.9fr)" }}>
        <div style={{ display: "grid", gap: "1rem" }}>
          <div className="onyx-card" style={{ padding: "1rem", display: "grid", gap: "0.85rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Review details</h2>
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="onyx-input" placeholder="Title" />
              <input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} className="onyx-input" placeholder="Jurisdiction" />
              <input value={caseType} onChange={(event) => setCaseType(event.target.value)} className="onyx-input" placeholder="Case type" />
              <input value={liabilityType} onChange={(event) => setLiabilityType(event.target.value)} className="onyx-input" placeholder="Liability type" />
              <input value={templateFamily} onChange={(event) => setTemplateFamily(event.target.value)} className="onyx-input" placeholder="Template family" />
              <input value={toneStyle} onChange={(event) => setToneStyle(event.target.value)} className="onyx-input" placeholder="Tone style" />
              <input value={qualityScore} onChange={(event) => setQualityScore(event.target.value)} className="onyx-input" placeholder="Quality score" />
              <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)} className="onyx-input">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="blocked">Blocked</option>
                <option value="needs_revision">Needs revision</option>
              </select>
            </div>
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} className="onyx-input" placeholder="Summary" style={{ width: "100%" }} />
            <textarea value={redactedText} onChange={(event) => setRedactedText(event.target.value)} rows={10} className="onyx-input" placeholder="Reusable redacted text" style={{ width: "100%" }} />
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <input value={injuryTags} onChange={(event) => setInjuryTags(event.target.value)} className="onyx-input" placeholder="Injury tags (comma separated)" />
              <input value={treatmentTags} onChange={(event) => setTreatmentTags(event.target.value)} className="onyx-input" placeholder="Treatment tags (comma separated)" />
              <input value={bodyPartTags} onChange={(event) => setBodyPartTags(event.target.value)} className="onyx-input" placeholder="Body part tags (comma separated)" />
            </div>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center" }}>
                <input type="checkbox" checked={approvedForReuse} onChange={(event) => { setApprovedForReuse(event.target.checked); if (event.target.checked) setBlockedForReuse(false); }} />
                Approved for reuse
              </label>
              <label style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center" }}>
                <input type="checkbox" checked={blockedForReuse} onChange={(event) => { setBlockedForReuse(event.target.checked); if (event.target.checked) setApprovedForReuse(false); }} />
                Blocked from reuse
              </label>
            </div>
            <div>
              <button type="button" className="onyx-btn-primary" onClick={() => void saveReviewState()} disabled={saving}>
                {saving ? "Saving…" : "Save review details"}
              </button>
            </div>
          </div>

          <div className="onyx-card" style={{ padding: "1rem", display: "grid", gap: "0.9rem" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Extracted sections</h2>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-secondary)" }}>
                These sections are what future retrieval can reuse once the document is approved.
              </p>
            </div>
            {detail.sections.length === 0 ? (
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>No reusable sections were extracted.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {detail.sections.map((section) => (
                  <div key={section.id} style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600 }}>{section.heading ?? section.sectionType}</p>
                        <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>
                          {section.sectionType} · updated {formatDate(section.updatedAt)}
                        </p>
                      </div>
                      <span className={section.approvedForReuse ? "onyx-badge onyx-badge-success" : "onyx-badge onyx-badge-warning"}>
                        {section.approvedForReuse ? "Reusable" : "Pending"}
                      </span>
                    </div>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
                      Redacted reusable text
                    </p>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--onyx-font-mono, ui-monospace, SFMono-Regular, monospace)", fontSize: "0.82rem", color: "var(--onyx-text-secondary)" }}>
                      {section.redactedText ?? section.originalText}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem", alignSelf: "start" }}>
          <div className="onyx-card" style={{ padding: "1rem", display: "grid", gap: "0.55rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Metadata</h2>
            <p style={{ margin: 0 }}><strong>Review state:</strong> {detail.item.reviewStatus}</p>
            <p style={{ margin: 0 }}><strong>Quality score:</strong> {detail.item.qualityScore ?? "—"}</p>
            <p style={{ margin: 0 }}><strong>Signals:</strong> {derivedSignals.length > 0 ? derivedSignals.join(", ") : "—"}</p>
            <p style={{ margin: 0 }}><strong>Injury tags:</strong> {formatArray(detail.item.injuryTags)}</p>
            <p style={{ margin: 0 }}><strong>Treatment tags:</strong> {formatArray(detail.item.treatmentTags)}</p>
            <p style={{ margin: 0 }}><strong>Body parts:</strong> {formatArray(detail.item.bodyPartTags)}</p>
            <p style={{ margin: 0 }}><strong>Reviewed at:</strong> {formatDate(detail.item.reviewedAt)}</p>
            <p style={{ margin: 0 }}><strong>Created:</strong> {formatDate(detail.item.createdAt)}</p>
          </div>

          <div className="onyx-card" style={{ padding: "1rem", display: "grid", gap: "0.55rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Links</h2>
            {detail.matter ? (
              <p style={{ margin: 0 }}>
                <strong>Matter:</strong>{" "}
                <Link href={`/dashboard/cases/${detail.matter.id}`} className="onyx-link">
                  {detail.matter.caseNumber ?? detail.matter.clientName ?? detail.matter.title ?? detail.matter.id}
                </Link>
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>No linked matter.</p>
            )}
            {detail.sourceDocument ? (
              <p style={{ margin: 0 }}>
                <strong>Source document:</strong>{" "}
                <Link href={`/dashboard/documents/${detail.sourceDocument.id}`} className="onyx-link">
                  {detail.sourceDocument.originalName ?? detail.sourceDocument.id}
                </Link>
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>No linked source document.</p>
            )}
          </div>

          <div className="onyx-card" style={{ padding: "1rem", display: "grid", gap: "0.65rem" }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Retrieval audit</h2>
            {detail.recentRuns.length === 0 ? (
              <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>
                This demand has not been returned by a logged retrieval/context-build run yet.
              </p>
            ) : (
              detail.recentRuns.map((run) => (
                <div key={run.id} style={{ borderTop: "1px solid var(--onyx-border-subtle)", paddingTop: "0.65rem" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{run.runType}</p>
                  <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "var(--onyx-text-muted)" }}>
                    {formatDate(run.createdAt)}{run.model ? ` · ${run.model}` : ""}{run.promptVersion ? ` · ${run.promptVersion}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
