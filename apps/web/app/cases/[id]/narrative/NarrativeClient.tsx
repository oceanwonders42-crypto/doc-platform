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

type AuthMeResponse = {
  ok?: boolean;
  role?: string;
  isPlatformAdmin?: boolean;
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

export default function NarrativePageClient({
  caseId,
  enabled = true,
}: {
  caseId: string;
  enabled?: boolean;
}) {
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
    if (!enabled) {
      setAuthChecked(true);
      return;
    }
    void loadAuthState();
    void loadDrafts();
  }, [caseId, enabled]);

  async function handleGenerate() {
    if (!enabled) return;
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

      {!enabled && (
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
          disabled={!enabled}
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
          disabled={!enabled}
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
              disabled={!enabled}
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
              disabled={!enabled}
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
              disabled={!enabled}
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
                disabled={!enabled}
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
              disabled={!enabled}
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
              disabled={!enabled}
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
          disabled={!enabled}
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
        disabled={loading || !enabled || !authChecked}
        style={{
          padding: "10px 20px",
          fontSize: 14,
          fontWeight: 600,
          border: "1px solid #111",
          borderRadius: 8,
          background: loading || !enabled || !authChecked ? "#ccc" : "#111",
          color: "#fff",
          cursor: loading || !enabled || !authChecked ? "not-allowed" : "pointer",
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
