"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatApiClientError, getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";

const NARRATIVE_TYPES = [
  { value: "treatment_summary", label: "Treatment summary" },
  { value: "injury_summary", label: "Injury summary" },
  { value: "pain_suffering", label: "Pain and suffering" },
  { value: "liability", label: "Liability" },
  { value: "demand_rationale", label: "Demand rationale" },
  { value: "response_to_denial", label: "Response to denial" },
  { value: "response_to_offer", label: "Response to offer" },
] as const;

const TONES = [
  { value: "neutral", label: "Neutral" },
  { value: "assertive", label: "Assertive" },
  { value: "aggressive", label: "Aggressive" },
] as const;

type UsedEvent = { eventDate: string | null; eventType: string | null; documentId: string };
type DemandApiStatus =
  | "draft_generated"
  | "pending_dev_review"
  | "dev_approved"
  | "approved"
  | "released"
  | "released_to_requester";
type NormalizedDemandStatus = "pending_dev_review" | "approved" | "released";
type DemandReviewItem = {
  id: string;
  status: DemandApiStatus;
  canViewText: boolean;
  text: string | null;
  warnings: string[];
  usedEvents: UsedEvent[];
  generatedAt: string;
  approvedAt: string | null;
  releasedAt: string | null;
  narrativeType: string;
  tone: string;
};

type RetrievalFeedback = {
  usefulness: "useful" | "not_useful" | null;
  removed: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type RetrievalMatchSignal = {
  label: string;
  currentValue: string;
  exampleValue: string;
  matched: boolean;
};

type DemandRetrievalPreview = {
  available: boolean;
  draftId: string;
  runId: string | null;
  runCreatedAt: string | null;
  unavailableReason: string | null;
  caseProfile: {
    jurisdiction: string | null;
    caseType: string | null;
    liabilityType: string | null;
    injuryTags: string[];
    treatmentTags: string[];
    bodyPartTags: string[];
    mriPresent: boolean | null;
    injectionsPresent: boolean | null;
    surgeryPresent: boolean | null;
    billsBand: "low" | "medium" | "high" | null;
    templateFamily: string | null;
  } | null;
  hiddenCounts: {
    examples: number;
    sections: number;
  };
  retrievedExamples: Array<{
    id: string;
    title: string;
    caseType: string | null;
    injuryTags: string[];
    totalBillsAmount: number | null;
    demandAmount: number | null;
    qualityScore: number | null;
    matchScore: number;
    matchReasons: string[];
    matchSignals: RetrievalMatchSignal[];
    feedback: RetrievalFeedback;
  }>;
  retrievedSections: Array<{
    id: string;
    demandBankDocumentId: string;
    sourceDemandTitle: string;
    sectionType: string;
    heading: string | null;
    previewText: string | null;
    matchScore: number;
    matchReasons: string[];
    feedback: RetrievalFeedback;
  }>;
};

type AuthMeResponse = {
  ok?: boolean;
  role?: string;
  isPlatformAdmin?: boolean;
};

type FeaturesResponse = {
  demand_narratives?: boolean;
};

const STATUS_LABELS: Record<NormalizedDemandStatus, string> = {
  pending_dev_review: "Pending internal review",
  approved: "Approved",
  released: "Released",
};

function normalizeDemandStatus(status: DemandApiStatus): NormalizedDemandStatus {
  if (status === "dev_approved" || status === "approved") return "approved";
  if (status === "released_to_requester" || status === "released") return "released";
  return "pending_dev_review";
}

function formatCurrency(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not recorded";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTagList(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None recorded";
}

function previewSnippet(value: string | null, limit = 320) {
  if (!value) return "No reusable preview text stored.";
  return value.length > limit ? `${value.slice(0, limit).trim()}…` : value;
}

export default function NarrativePageClient({
  caseId,
  enabled = null,
}: {
  caseId: string;
  enabled?: boolean | null;
}) {
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(enabled);
  const [type, setType] = useState<string>("treatment_summary");
  const [tone, setTone] = useState<string>("neutral");
  const [notes, setNotes] = useState("");
  const [mainInjuries, setMainInjuries] = useState("");
  const [treatmentHighlights, setTreatmentHighlights] = useState("");
  const [lostWagesYesNo, setLostWagesYesNo] = useState<"" | "yes" | "no">("");
  const [lostWagesAmount, setLostWagesAmount] = useState("");
  const [currentDemandAmount, setCurrentDemandAmount] = useState("");
  const [keyLiabilityFacts, setKeyLiabilityFacts] = useState("");
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isPlatformReviewer, setIsPlatformReviewer] = useState(false);
  const [draftItems, setDraftItems] = useState<DemandReviewItem[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionDraftId, setActionDraftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [retrievalPreview, setRetrievalPreview] = useState<DemandRetrievalPreview | null>(null);
  const [retrievalLoading, setRetrievalLoading] = useState(false);
  const [retrievalError, setRetrievalError] = useState<string | null>(null);
  const [retrievalStatusMessage, setRetrievalStatusMessage] = useState<string | null>(null);
  const [retrievalActionKey, setRetrievalActionKey] = useState<string | null>(null);
  const featureResolved = featureEnabled !== null;
  const demandNarrativesEnabled = featureEnabled === true;
  const visibleDraftItems = useMemo(() => {
    if (isPlatformReviewer) return draftItems;
    return draftItems.filter((item) => normalizeDemandStatus(item.status) === "released");
  }, [draftItems, isPlatformReviewer]);
  const selectedDraft = useMemo(() => {
    if (visibleDraftItems.length === 0) return null;
    return visibleDraftItems.find((item) => item.id === selectedDraftId) ?? visibleDraftItems[0];
  }, [visibleDraftItems, selectedDraftId]);
  const selectedDraftStatus = selectedDraft ? normalizeDemandStatus(selectedDraft.status) : null;
  const hasHiddenUnreleasedDrafts =
    !isPlatformReviewer && draftItems.length > 0 && visibleDraftItems.length === 0;
  const visibleText = selectedDraft?.text ?? "";
  const warnings = selectedDraft?.warnings ?? [];
  const usedEvents = selectedDraft?.usedEvents ?? [];
  const retrievedExamples = useMemo(() => {
    if (!retrievalPreview?.retrievedExamples) return [];
    return [...retrievalPreview.retrievedExamples].sort((left, right) => {
      if (left.feedback.removed !== right.feedback.removed) {
        return left.feedback.removed ? 1 : -1;
      }
      return right.matchScore - left.matchScore;
    });
  }, [retrievalPreview]);
  const retrievedSections = useMemo(() => {
    if (!retrievalPreview?.retrievedSections) return [];
    return [...retrievalPreview.retrievedSections].sort((left, right) => {
      if (left.feedback.removed !== right.feedback.removed) {
        return left.feedback.removed ? 1 : -1;
      }
      return right.matchScore - left.matchScore;
    });
  }, [retrievalPreview]);

  async function loadAuthState() {
    try {
      const response = await fetch(`${getApiBase()}/auth/me`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      if (!response.ok) {
        setIsPlatformReviewer(false);
        return;
      }
      const data = (await parseJsonResponse(response)) as AuthMeResponse;
      const platformAdmin = data.isPlatformAdmin === true || data.role === "PLATFORM_ADMIN";
      setIsPlatformReviewer(platformAdmin);
    } catch {
      setIsPlatformReviewer(false);
    } finally {
      setAuthChecked(true);
    }
  }

  async function loadFeatureState() {
    if (enabled !== null) {
      setFeatureEnabled(enabled);
      return;
    }
    try {
      const response = await fetch(`${getApiBase()}/me/features`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as FeaturesResponse;
      setFeatureEnabled(response.ok && data.demand_narratives === true);
    } catch {
      setFeatureEnabled(false);
    }
  }

  async function loadDrafts(preferredDraftId?: string | null) {
    try {
      const response = await fetch(`${getApiBase()}/cases/${encodeURIComponent(caseId)}/demand-narratives`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(response)) as {
        ok?: boolean;
        items?: DemandReviewItem[];
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Failed to load demand review status.");
        return;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      setDraftItems(items);
      setSelectedDraftId(preferredDraftId ?? items[0]?.id ?? null);
    } catch (err) {
      setError(formatApiClientError(err, "Failed to load demand review status."));
    }
  }

  useEffect(() => {
    if (!featureResolved) {
      void loadFeatureState();
      return;
    }
    if (!demandNarrativesEnabled) {
      setAuthChecked(true);
      return;
    }
    void loadAuthState();
    void loadDrafts();
  }, [caseId, demandNarrativesEnabled, featureResolved]);

  useEffect(() => {
    if (!demandNarrativesEnabled || !selectedDraft?.id) {
      setRetrievalPreview(null);
      setRetrievalError(null);
      setRetrievalStatusMessage(null);
      setRetrievalLoading(false);
      return;
    }

    let active = true;
    setRetrievalLoading(true);
    setRetrievalError(null);
    setRetrievalStatusMessage(null);
    void fetch(`${getApiBase()}/cases/${encodeURIComponent(caseId)}/demand-narratives/${encodeURIComponent(selectedDraft.id)}/retrieval-preview`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(async (response) => {
        const data = (await parseJsonResponse(response)) as {
          ok?: boolean;
          preview?: DemandRetrievalPreview;
          error?: string;
        };
        if (!response.ok || data.ok === false || !data.preview) {
          throw new Error(data.error ?? "Failed to load retrieved demand examples.");
        }
        if (!active) return;
        setRetrievalPreview(data.preview);
      })
      .catch((requestError) => {
        if (!active) return;
        setRetrievalPreview(null);
        setRetrievalError(formatApiClientError(requestError, "Failed to load retrieved demand examples."));
      })
      .finally(() => {
        if (!active) return;
        setRetrievalLoading(false);
      });

    return () => {
      active = false;
    };
  }, [caseId, demandNarrativesEnabled, selectedDraft?.id]);

  async function handleGenerate() {
    if (!demandNarrativesEnabled) return;
    setLoading(true);
    setError(null);
    setStatusMessage(null);
    try {
      const questionnairePayload =
        mainInjuries.trim() ||
        treatmentHighlights.trim() ||
        lostWagesYesNo ||
        lostWagesAmount.trim() ||
        currentDemandAmount.trim() ||
        keyLiabilityFacts.trim()
          ? {
              mainInjuries: mainInjuries.trim() || undefined,
              treatmentHighlights: treatmentHighlights.trim() || undefined,
              lostWagesYesNo:
                lostWagesYesNo === "yes" ? true : lostWagesYesNo === "no" ? false : undefined,
              lostWagesAmount: lostWagesAmount.trim() || undefined,
              currentDemandAmount: currentDemandAmount.trim() || undefined,
              keyLiabilityFacts: keyLiabilityFacts.trim() || undefined,
            }
          : undefined;

      const res = await fetch(`${getApiBase()}/cases/${encodeURIComponent(caseId)}/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({
          type,
          tone,
          notes: notes || undefined,
          questionnaire: questionnairePayload,
        }),
      });
      const data = (await parseJsonResponse(res)) as {
        ok?: boolean;
        item?: DemandReviewItem;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setStatusMessage(
        data.message ??
          "Demand draft generated and queued for mandatory internal developer review."
      );
      await loadDrafts(data.item?.id ?? null);
    } catch (e) {
      setError(formatApiClientError(e, "Failed to generate demand draft."));
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(draftId: string) {
    setActionDraftId(draftId);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch(
        `${getApiBase()}/cases/${encodeURIComponent(caseId)}/demand-narratives/${encodeURIComponent(draftId)}/approve`,
        {
          method: "POST",
          headers: getAuthHeader(),
          ...getFetchOptions(),
        }
      );
      const data = (await parseJsonResponse(response)) as {
        ok?: boolean;
        item?: DemandReviewItem;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Failed to approve demand draft.");
        return;
      }
      setStatusMessage("Demand draft approved and ready for release.");
      await loadDrafts(data.item?.id ?? draftId);
    } catch (err) {
      setError(formatApiClientError(err, "Failed to approve demand draft."));
    } finally {
      setActionDraftId(null);
    }
  }

  async function handleRelease(draftId: string) {
    setActionDraftId(draftId);
    setError(null);
    setStatusMessage(null);
    try {
      const response = await fetch(
        `${getApiBase()}/cases/${encodeURIComponent(caseId)}/demand-narratives/${encodeURIComponent(draftId)}/release`,
        {
          method: "POST",
          headers: getAuthHeader(),
          ...getFetchOptions(),
        }
      );
      const data = (await parseJsonResponse(response)) as {
        ok?: boolean;
        item?: DemandReviewItem;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Failed to release demand draft.");
        return;
      }
      setStatusMessage("Demand draft released to the requesting team.");
      await loadDrafts(data.item?.id ?? draftId);
    } catch (err) {
      setError(formatApiClientError(err, "Failed to release demand draft."));
    } finally {
      setActionDraftId(null);
    }
  }

  async function handleRetrievalFeedback(
    itemType: "document" | "section",
    itemId: string,
    payload: { usefulness?: "useful" | "not_useful"; removed?: boolean },
    successMessage: string
  ) {
    if (!selectedDraft?.id) return;
    const actionKey = `${itemType}:${itemId}:${payload.usefulness ?? "none"}:${payload.removed ?? "keep"}`;
    setRetrievalActionKey(actionKey);
    setRetrievalError(null);
    setRetrievalStatusMessage(null);
    try {
      const response = await fetch(
        `${getApiBase()}/cases/${encodeURIComponent(caseId)}/demand-narratives/${encodeURIComponent(selectedDraft.id)}/retrieval-feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          ...getFetchOptions(),
          body: JSON.stringify({
            itemType,
            itemId,
            ...payload,
          }),
        }
      );
      const data = (await parseJsonResponse(response)) as {
        ok?: boolean;
        preview?: DemandRetrievalPreview;
        error?: string;
      };
      if (!response.ok || data.ok === false || !data.preview) {
        throw new Error(data.error ?? "Failed to save retrieval feedback.");
      }
      setRetrievalPreview(data.preview);
      setRetrievalStatusMessage(successMessage);
    } catch (requestError) {
      setRetrievalError(formatApiClientError(requestError, "Failed to save retrieval feedback."));
    } finally {
      setRetrievalActionKey(null);
    }
  }

  function handleCopy() {
    if (!visibleText) return;
    navigator.clipboard.writeText(visibleText).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setError("Copy failed")
    );
  }

  const docIds = [...new Set(usedEvents.map((e) => e.documentId))];

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <Link href={`/cases/${caseId}`} style={{ fontSize: 14, color: "#111", textDecoration: "underline" }}>
          ← Case {caseId}
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Demand Narrative Assistant</h1>
      </div>

      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
        Generate draft narrative sections from case timeline and extracted fields. Every generated demand stays blocked in internal developer review until a platform reviewer approves and releases it.
      </p>

      {!featureResolved && (
        <div style={{ padding: 16, marginBottom: 24, background: "#f8f9fa", border: "1px solid #d0d7de", borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
            Checking Demand Narrative Assistant access for this firm.
          </p>
        </div>
      )}

      {featureResolved && !demandNarrativesEnabled && (
        <div style={{ padding: 16, marginBottom: 24, background: "#fff8e6", border: "1px solid #e6d68a", borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
            The Demand Narrative Assistant add-on is not enabled for your firm. Contact your administrator to enable it.
          </p>
        </div>
      )}

      <section style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Narrative type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={!demandNarrativesEnabled}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 8,
            minWidth: 220,
          }}
        >
          {NARRATIVE_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </section>

      <section style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Tone
        </label>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          disabled={!demandNarrativesEnabled}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 8,
            minWidth: 160,
          }}
        >
          {TONES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Demand narrative questionnaire (optional)
        </h2>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          Answers are used to enrich the draft and are not stored.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Main injuries
            </label>
            <textarea
              value={mainInjuries}
              onChange={(e) => setMainInjuries(e.target.value)}
              placeholder="e.g. Cervical strain, lumbar disc herniation"
              rows={2}
              disabled={!demandNarrativesEnabled}
              style={{
                width: "100%",
                maxWidth: 500,
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Treatment highlights
            </label>
            <textarea
              value={treatmentHighlights}
              onChange={(e) => setTreatmentHighlights(e.target.value)}
              placeholder="e.g. 12 PT sessions, MRI, pain management"
              rows={2}
              disabled={!demandNarrativesEnabled}
              style={{
                width: "100%",
                maxWidth: 500,
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Lost wages
            </label>
            <select
              value={lostWagesYesNo}
              onChange={(e) => setLostWagesYesNo((e.target.value || "") as "" | "yes" | "no")}
              disabled={!demandNarrativesEnabled}
              style={{
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid #ccc",
                borderRadius: 8,
                minWidth: 120,
                marginRight: 12,
              }}
            >
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            {lostWagesYesNo === "yes" && (
              <input
                type="text"
                value={lostWagesAmount}
                onChange={(e) => setLostWagesAmount(e.target.value)}
                placeholder="Amount (optional)"
                disabled={!demandNarrativesEnabled}
                style={{
                  padding: "8px 12px",
                  fontSize: 14,
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  width: 160,
                }}
              />
            )}
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Current demand amount (optional)
            </label>
            <input
              type="text"
              value={currentDemandAmount}
              onChange={(e) => setCurrentDemandAmount(e.target.value)}
              placeholder="e.g. $50,000"
              disabled={!demandNarrativesEnabled}
              style={{
                width: "100%",
                maxWidth: 200,
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Key liability facts
            </label>
            <textarea
              value={keyLiabilityFacts}
              onChange={(e) => setKeyLiabilityFacts(e.target.value)}
              placeholder="e.g. Defendant ran red light; witness statements"
              rows={2}
              disabled={!demandNarrativesEnabled}
              style={{
                width: "100%",
                maxWidth: 500,
                padding: "8px 12px",
                fontSize: 14,
                border: "1px solid #ccc",
                borderRadius: 8,
              }}
            />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Emphasize ongoing PT; mention lost wages"
          rows={3}
          disabled={!demandNarrativesEnabled}
          style={{
            width: "100%",
            maxWidth: 500,
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />
      </section>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading || !demandNarrativesEnabled || !authChecked}
        style={{
          padding: "10px 20px",
          fontSize: 14,
          fontWeight: 600,
          border: "1px solid #111",
          borderRadius: 8,
          background: loading || !demandNarrativesEnabled || !authChecked ? "#ccc" : "#111",
          color: "#fff",
          cursor: loading || !demandNarrativesEnabled || !authChecked ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Generating…" : "Generate draft"}
      </button>

      {statusMessage && (
        <p style={{ marginTop: 12, color: "#0f5132", fontSize: 14 }}>{statusMessage}</p>
      )}

      {error && (
        <p style={{ marginTop: 12, color: "#c00", fontSize: 14 }}>{error}</p>
      )}

      <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 10, background: "#fafafa" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Demand review status</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#666" }}>
              {isPlatformReviewer
                ? "Generated drafts stay hidden from the requesting team until approval and release."
                : "Only released demand narratives appear here."}
            </p>
          </div>
          {isPlatformReviewer && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0b5394" }}>Platform reviewer view</span>
          )}
        </div>

        {visibleDraftItems.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
            {hasHiddenUnreleasedDrafts
              ? "Your draft is in review. It will appear here after a platform reviewer releases it."
              : isPlatformReviewer
                ? "No generated demand drafts yet."
                : "No released demand drafts yet."}
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {visibleDraftItems.map((item) => {
              const isSelected = selectedDraft?.id === item.id;
              const normalizedStatus = normalizeDemandStatus(item.status);
              return (
                <div
                  key={item.id}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: isSelected ? "1px solid #111" : "1px solid #ddd",
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{STATUS_LABELS[normalizedStatus]}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                        Generated {new Date(item.generatedAt).toLocaleString()} · {item.narrativeType.replace(/_/g, " ")} · {item.tone}
                      </p>
                      {item.approvedAt && (
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                          Approved {new Date(item.approvedAt).toLocaleString()}
                        </p>
                      )}
                      {item.releasedAt && (
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                          Released {new Date(item.releasedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setSelectedDraftId(item.id)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          border: "1px solid #111",
                          borderRadius: 6,
                          background: isSelected ? "#111" : "#fff",
                          color: isSelected ? "#fff" : "#111",
                          cursor: "pointer",
                        }}
                      >
                        {isSelected ? "Selected" : "Open"}
                      </button>
                      {isPlatformReviewer && normalizedStatus === "pending_dev_review" && (
                        <button
                          type="button"
                          onClick={() => handleApprove(item.id)}
                          disabled={actionDraftId === item.id}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            border: "1px solid #0f5132",
                            borderRadius: 6,
                            background: "#fff",
                            color: "#0f5132",
                            cursor: actionDraftId === item.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {actionDraftId === item.id ? "Approving..." : "Approve"}
                        </button>
                      )}
                      {isPlatformReviewer && normalizedStatus === "approved" && (
                        <button
                          type="button"
                          onClick={() => handleRelease(item.id)}
                          disabled={actionDraftId === item.id}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            border: "1px solid #0b5394",
                            borderRadius: 6,
                            background: "#fff",
                            color: "#0b5394",
                            cursor: actionDraftId === item.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {actionDraftId === item.id ? "Releasing..." : "Release"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedDraft && (
        <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 10, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Retrieved Demand Examples</h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#666" }}>
                This panel shows the approved Demand Bank examples that were retrieved for the selected draft. Current case facts still control the draft.
              </p>
            </div>
            {retrievalPreview?.runCreatedAt && (
              <span style={{ fontSize: 12, color: "#666" }}>
                Retrieved {new Date(retrievalPreview.runCreatedAt).toLocaleString()}
              </span>
            )}
          </div>

          {retrievalStatusMessage && (
            <p style={{ margin: "0 0 12px", color: "#0f5132", fontSize: 13 }}>{retrievalStatusMessage}</p>
          )}

          {retrievalError && (
            <p style={{ margin: "0 0 12px", color: "#c00", fontSize: 13 }}>{retrievalError}</p>
          )}

          {retrievalLoading ? (
            <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Loading retrieved examples…</p>
          ) : !retrievalPreview ? (
            <p style={{ margin: 0, fontSize: 14, color: "#666" }}>Retrieved examples unavailable.</p>
          ) : !retrievalPreview.available ? (
            <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
              {retrievalPreview.unavailableReason ?? "Retrieved examples were not recorded for this draft."}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <div style={{ padding: 12, borderRadius: 8, border: "1px solid #e1e5ea", background: "#f8fafc" }}>
                <p style={{ margin: 0, fontSize: 13, color: "#334155" }}>
                  {retrievalPreview.caseProfile
                    ? `Matched against ${retrievalPreview.caseProfile.caseType ?? "untyped"} / ${retrievalPreview.caseProfile.liabilityType ?? "general"} matter signals`
                    : "Matched against the stored case profile from generation time."}
                  {retrievalPreview.hiddenCounts.examples > 0 || retrievalPreview.hiddenCounts.sections > 0
                    ? ` ${retrievalPreview.hiddenCounts.examples} example(s) and ${retrievalPreview.hiddenCounts.sections} section(s) are hidden because they are no longer approved for reuse.`
                    : ""}
                </p>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Retrieved demands</h3>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                    Prior approved demand examples are shown for structure and tone only, not for current-case facts.
                  </p>
                </div>
                {retrievedExamples.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 14, color: "#666" }}>No approved demand examples were stored for this draft.</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {retrievedExamples.map((example) => {
                      const usefulActionKey = `document:${example.id}:useful:keep`;
                      const notUsefulActionKey = `document:${example.id}:not_useful:keep`;
                      const removeActionKey = `document:${example.id}:none:${!example.feedback.removed}`;
                      return (
                        <div
                          key={example.id}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid #ddd",
                            background: example.feedback.removed ? "#f8f9fa" : "#fff",
                            opacity: example.feedback.removed ? 0.72 : 1,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div>
                              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{example.title}</p>
                              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                                {example.caseType ?? "Case type not tagged"} · injuries: {formatTagList(example.injuryTags)}
                              </p>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {example.feedback.removed && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#8a4b00" }}>Removed from this draft review</span>
                              )}
                              {example.feedback.usefulness === "useful" && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#0f5132" }}>Marked useful</span>
                              )}
                              {example.feedback.usefulness === "not_useful" && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#842029" }}>Marked not useful</span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 10 }}>
                            <div style={{ fontSize: 12, color: "#555" }}>
                              <strong style={{ color: "#111" }}>Total bills:</strong> {formatCurrency(example.totalBillsAmount)}
                            </div>
                            <div style={{ fontSize: 12, color: "#555" }}>
                              <strong style={{ color: "#111" }}>Demand amount:</strong> {formatCurrency(example.demandAmount)}
                            </div>
                            <div style={{ fontSize: 12, color: "#555" }}>
                              <strong style={{ color: "#111" }}>Quality score:</strong> {example.qualityScore ?? "Not scored"}
                            </div>
                            <div style={{ fontSize: 12, color: "#555" }}>
                              <strong style={{ color: "#111" }}>Match score:</strong> {example.matchScore}
                            </div>
                          </div>

                          <div style={{ marginTop: 12 }}>
                            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#111" }}>Why this was used</p>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#555" }}>
                              {example.matchReasons.length > 0 ? (
                                example.matchReasons.map((reason) => <li key={reason}>{reason}</li>)
                              ) : (
                                <li>Approved reusable demand example selected from stored case similarity.</li>
                              )}
                            </ul>
                          </div>

                          <div style={{ marginTop: 12 }}>
                            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#111" }}>Matched on</p>
                            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                              {example.matchSignals.map((signal) => (
                                <div key={signal.label} style={{ padding: 8, borderRadius: 6, border: "1px solid #e5e7eb", background: "#fafafa" }}>
                                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{signal.label}</p>
                                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#555" }}>
                                    Case: {signal.currentValue} · Example: {signal.exampleValue}
                                  </p>
                                  <p style={{ margin: "4px 0 0", fontSize: 12, color: signal.matched ? "#0f5132" : "#666" }}>
                                    {signal.matched ? "Matched" : "No direct match"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {isPlatformReviewer && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRetrievalFeedback("document", example.id, { usefulness: "useful" }, "Demand example marked useful.")
                                }
                                disabled={retrievalActionKey === usefulActionKey}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  border: "1px solid #0f5132",
                                  borderRadius: 6,
                                  background: example.feedback.usefulness === "useful" ? "#0f5132" : "#fff",
                                  color: example.feedback.usefulness === "useful" ? "#fff" : "#0f5132",
                                  cursor: retrievalActionKey === usefulActionKey ? "not-allowed" : "pointer",
                                }}
                              >
                                {retrievalActionKey === usefulActionKey ? "Saving..." : "Useful"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRetrievalFeedback("document", example.id, { usefulness: "not_useful" }, "Demand example marked not useful.")
                                }
                                disabled={retrievalActionKey === notUsefulActionKey}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  border: "1px solid #842029",
                                  borderRadius: 6,
                                  background: example.feedback.usefulness === "not_useful" ? "#842029" : "#fff",
                                  color: example.feedback.usefulness === "not_useful" ? "#fff" : "#842029",
                                  cursor: retrievalActionKey === notUsefulActionKey ? "not-allowed" : "pointer",
                                }}
                              >
                                {retrievalActionKey === notUsefulActionKey ? "Saving..." : "Not useful"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRetrievalFeedback(
                                    "document",
                                    example.id,
                                    { removed: !example.feedback.removed },
                                    example.feedback.removed
                                      ? "Demand example restored to this draft review."
                                      : "Demand example removed from this draft review."
                                  )
                                }
                                disabled={retrievalActionKey === removeActionKey}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  border: "1px solid #555",
                                  borderRadius: 6,
                                  background: "#fff",
                                  color: "#333",
                                  cursor: retrievalActionKey === removeActionKey ? "not-allowed" : "pointer",
                                }}
                              >
                                {retrievalActionKey === removeActionKey
                                  ? "Saving..."
                                  : example.feedback.removed
                                    ? "Restore example"
                                    : "Remove from draft"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Retrieved sections</h3>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
                    Section-level examples stay clearly labeled so reviewers can inspect the exact reusable language the run surfaced.
                  </p>
                </div>
                {retrievedSections.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 14, color: "#666" }}>No reusable sections were stored for this draft.</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {retrievedSections.map((section) => {
                      const usefulActionKey = `section:${section.id}:useful:keep`;
                      const notUsefulActionKey = `section:${section.id}:not_useful:keep`;
                      const removeActionKey = `section:${section.id}:none:${!section.feedback.removed}`;
                      return (
                        <div
                          key={section.id}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid #ddd",
                            background: section.feedback.removed ? "#f8f9fa" : "#fff",
                            opacity: section.feedback.removed ? 0.72 : 1,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div>
                              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                                {section.heading ?? section.sectionType}
                              </p>
                              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                                {section.sectionType} from {section.sourceDemandTitle}
                              </p>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                              {section.feedback.removed && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#8a4b00" }}>Removed from this draft review</span>
                              )}
                              {section.feedback.usefulness === "useful" && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#0f5132" }}>Marked useful</span>
                              )}
                              {section.feedback.usefulness === "not_useful" && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#842029" }}>Marked not useful</span>
                              )}
                            </div>
                          </div>

                          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#555" }}>
                            {previewSnippet(section.previewText)}
                          </p>

                          <div style={{ marginTop: 12 }}>
                            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#111" }}>Why this was used</p>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#555" }}>
                              {section.matchReasons.length > 0 ? (
                                section.matchReasons.map((reason) => <li key={reason}>{reason}</li>)
                              ) : (
                                <li>Approved reusable section selected from stored case similarity.</li>
                              )}
                            </ul>
                          </div>

                          {isPlatformReviewer && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRetrievalFeedback("section", section.id, { usefulness: "useful" }, "Retrieved section marked useful.")
                                }
                                disabled={retrievalActionKey === usefulActionKey}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  border: "1px solid #0f5132",
                                  borderRadius: 6,
                                  background: section.feedback.usefulness === "useful" ? "#0f5132" : "#fff",
                                  color: section.feedback.usefulness === "useful" ? "#fff" : "#0f5132",
                                  cursor: retrievalActionKey === usefulActionKey ? "not-allowed" : "pointer",
                                }}
                              >
                                {retrievalActionKey === usefulActionKey ? "Saving..." : "Useful"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRetrievalFeedback("section", section.id, { usefulness: "not_useful" }, "Retrieved section marked not useful.")
                                }
                                disabled={retrievalActionKey === notUsefulActionKey}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  border: "1px solid #842029",
                                  borderRadius: 6,
                                  background: section.feedback.usefulness === "not_useful" ? "#842029" : "#fff",
                                  color: section.feedback.usefulness === "not_useful" ? "#fff" : "#842029",
                                  cursor: retrievalActionKey === notUsefulActionKey ? "not-allowed" : "pointer",
                                }}
                              >
                                {retrievalActionKey === notUsefulActionKey ? "Saving..." : "Not useful"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRetrievalFeedback(
                                    "section",
                                    section.id,
                                    { removed: !section.feedback.removed },
                                    section.feedback.removed
                                      ? "Retrieved section restored to this draft review."
                                      : "Retrieved section removed from this draft review."
                                  )
                                }
                                disabled={retrievalActionKey === removeActionKey}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  border: "1px solid #555",
                                  borderRadius: 6,
                                  background: "#fff",
                                  color: "#333",
                                  cursor: retrievalActionKey === removeActionKey ? "not-allowed" : "pointer",
                                }}
                              >
                                {retrievalActionKey === removeActionKey
                                  ? "Saving..."
                                  : section.feedback.removed
                                    ? "Restore section"
                                    : "Remove from draft"}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: "#fff8e6", border: "1px solid #e6d68a", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Warnings</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#666" }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {selectedDraft && !selectedDraft.canViewText && (
        <div style={{ marginTop: 24, padding: 16, background: "#f8f9fa", border: "1px solid #d0d7de", borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
            This draft is currently <strong>{STATUS_LABELS[selectedDraftStatus ?? "pending_dev_review"].toLowerCase()}</strong>. The requesting team cannot view the generated demand text until a platform reviewer releases it.
          </p>
        </div>
      )}

      {visibleText && (
        <>
          <section style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                {selectedDraftStatus === "released" ? "Released demand output" : "Internal draft output"}
              </label>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  border: "1px solid #06c",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#06c",
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied!" : "Copy to clipboard"}
              </button>
            </div>
            <textarea
              value={visibleText}
              readOnly
              rows={14}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: 14,
                border: "1px solid #ccc",
                borderRadius: 8,
                fontFamily: "inherit",
              }}
            />
          </section>

          {docIds.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Sources used</h2>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                Timeline events were built from these documents. Open to verify or pull details.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {docIds.map((docId) => {
                  const ev = usedEvents.find((e) => e.documentId === docId);
                  return (
                    <li key={docId} style={{ marginBottom: 6 }}>
                      <Link
                        href={`/documents/${docId}`}
                        style={{ fontSize: 14, color: "#06c", textDecoration: "underline" }}
                      >
                        Document {docId}
                      </Link>
                      {ev && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>
                          {ev.eventDate ? new Date(ev.eventDate).toLocaleDateString() : ""} {ev.eventType ?? ""}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
