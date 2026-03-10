"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "../../../lib/formatTimestamp";

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
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [usedEvents, setUsedEvents] = useState<UsedEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    setWarnings([]);
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

      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          tone,
          notes: notes || undefined,
          questionnaire: questionnairePayload,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        text?: string;
        usedEvents?: UsedEvent[];
        warnings?: string[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setText(data.text ?? "");
      setUsedEvents(Array.isArray(data.usedEvents) ? data.usedEvents : []);
      setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!text) return;
    navigator.clipboard.writeText(text).then(
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
        Generate draft narrative sections from case timeline and extracted fields. Copy and edit as needed.
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
        disabled={loading || !enabled}
        style={{
          padding: "10px 20px",
          fontSize: 14,
          fontWeight: 600,
          border: "1px solid #111",
          borderRadius: 8,
          background: loading || !enabled ? "#ccc" : "#111",
          color: "#fff",
          cursor: loading || !enabled ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Generating…" : "Generate draft"}
      </button>

      {error && (
        <p style={{ marginTop: 12, color: "#c00", fontSize: 14 }}>{error}</p>
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

      {text && (
        <>
          <section style={{ marginTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Draft output</label>
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
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={false}
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
                          {ev.eventDate ? formatDate(ev.eventDate) : ""} {ev.eventType ?? ""}
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
