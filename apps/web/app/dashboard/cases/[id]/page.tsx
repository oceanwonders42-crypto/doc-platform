"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { Timeline, TimelineItem } from "@/components/dashboard/Timeline";
import { DocumentPreview } from "@/components/dashboard/DocumentPreview";

type CaseItem = { id: string; title: string | null; caseNumber: string | null; clientName: string | null; createdAt: string };
type TimelineEvent = {
  id: string;
  eventDate: string | null;
  eventType: string | null;
  track: string | null;
  provider: string | null;
  diagnosis: string | null;
  procedure: string | null;
  amount: string | number | null;
  metadataJson?: { dateUncertain?: boolean; dateSource?: string; providerSource?: string } | null;
};
type Provider = { id: string; providerId: string; provider?: { name?: string }; relationship?: string };
type Doc = { id: string; originalName: string; status: string; pageCount: number | null; createdAt?: string; routedCaseId?: string | null; providerName?: string | null };
type Financial = { medicalBillsTotal: number; liensTotal: number; settlementOffer: number | null };
type Insight = { type: string; severity: string; title: string; detail: string | null };
type BillLine = { id: string; documentId: string; providerName: string | null; serviceDate: string | null; amountCharged: number | null; balance: number | null; lineTotal: number | null };

type ExportHistoryItem = { id: string; fileName: string; packetType: string; createdAt: string };
type ExportHistoryResponse = { ok?: boolean; items?: ExportHistoryItem[] };

function isExportHistoryResponse(res: unknown): res is ExportHistoryResponse {
  return typeof res === "object" && res !== null;
}

export default function CaseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [caseData, setCaseData] = useState<CaseItem | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [financial, setFinancial] = useState<Financial | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [billLines, setBillLines] = useState<BillLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([]);
  const [chronologyRebuilding, setChronologyRebuilding] = useState(false);
  const [summarizeLoading, setSummarizeLoading] = useState(false);
  const [summarizeResult, setSummarizeResult] = useState<{
    body: string;
    sections: { conciseNarrative: string; injuries: string[]; providersInvolved: string[]; treatmentTimelineSummary: string; latestOffer: { amount: number; date: string; source?: string } | null };
    documentSummaries: { documentId: string; originalName: string | null; summary: string }[];
    hasContent: boolean;
  } | null>(null);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractResult, setExtractResult] = useState<{
    providers: { name: string; source: string }[];
    dates: { date: string; label: string; source?: string }[];
    costs: { amount: number; label: string; source?: string }[];
    hasContent: boolean;
  } | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingResult, setMissingResult] = useState<{
    flags: { category: string; reason: string; confidence?: string; providerName?: string | null; recordsRequestId?: string | null }[];
    hasEvidence: boolean;
    message?: string;
  } | null>(null);
  const [missingError, setMissingError] = useState<string | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<{
    flags: { category: string; reason: string; confidence?: string; providerName?: string | null; documentId?: string | null; dateContext?: string | null }[];
    hasEvidence: boolean;
    message?: string;
  } | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [draftSectionKey, setDraftSectionKey] = useState<string>("treatment_summary");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftResult, setDraftResult] = useState<{
    sectionKey: string;
    title: string;
    draftText: string;
    warnings?: string[];
  } | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [questionInput, setQuestionInput] = useState("");
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerResult, setAnswerResult] = useState<{ answer: string; sourcesUsed: string[]; warnings?: string[] } | null>(null);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [packetType, setPacketType] = useState<"records" | "bills" | "combined">("combined");
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [groupDocsByProvider, setGroupDocsByProvider] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "chronology" | "medical-bills" | "missing-records" | "demands" | "tasks" | "activity" | "contacts" | "notes">("overview");

  const TABS: { id: typeof activeTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "documents", label: "Documents" },
    { id: "chronology", label: "Chronology" },
    { id: "medical-bills", label: "Medical Bills / Specials" },
    { id: "missing-records", label: "Missing Records" },
    { id: "demands", label: "Demands" },
    { id: "tasks", label: "Tasks" },
    { id: "activity", label: "Activity" },
    { id: "contacts", label: "Contacts" },
    { id: "notes", label: "Notes" },
  ];

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && TABS.some((t) => t.id === tabFromUrl)) {
      setActiveTab(tabFromUrl as typeof activeTab);
    }
  }, [searchParams]);

  const AI_ACTIONS = [
    { id: "summarize", label: "Summarize this packet", comingSoon: false },
    { id: "chronology", label: "Build chronology", comingSoon: false },
    { id: "extract", label: "Extract providers/dates/costs", comingSoon: false },
    { id: "missing", label: "Identify missing records", comingSoon: false },
    { id: "compare", label: "Compare bills to treatment", comingSoon: false },
    { id: "draft", label: "Draft demand section", comingSoon: false },
    { id: "qa", label: "Answer questions about the case", comingSoon: false },
  ];

  useEffect(() => {
    if (!id) return;
    const base = getApiBase();
    const headers = getAuthHeader();
    const acceptJson = { Accept: "application/json" };
    Promise.all([
      fetch(`${base}/cases/${id}`, { headers: { ...headers, ...acceptJson } }).then(parseJsonResponse),
      fetch(`${base}/cases/${id}/timeline`, { headers }).then(parseJsonResponse),
      fetch(`${base}/cases/${id}/providers`, { headers }).then(parseJsonResponse),
      fetch(`${base}/cases/${id}/documents?includeProvider=true`, { headers }).then(parseJsonResponse),
      fetch(`${base}/cases/${id}/financial`, { headers }).then(parseJsonResponse),
      fetch(`${base}/cases/${id}/bill-line-items`, { headers }).then(parseJsonResponse).catch(() => ({ ok: false })),
      fetch(`${base}/cases/${id}/insights`, { headers }).then(parseJsonResponse).catch(() => ({ ok: false })),
    ])
      .then(([caseRes, timelineRes, providersRes, docsRes, finRes, billRes, insightsRes]) => {
        const c = caseRes as { ok?: boolean; item?: CaseItem };
        const t = timelineRes as { ok?: boolean; items?: TimelineEvent[] };
        const p = providersRes as { ok?: boolean; items?: Provider[] };
        const d = docsRes as { ok?: boolean; items?: Doc[] };
        const f = finRes as { ok?: boolean; item?: Financial };
        const b = billRes as { ok?: boolean; items?: BillLine[] };
        const i = insightsRes as { ok?: boolean; insights?: Insight[] };
        if (c.ok && c.item) setCaseData(c.item);
        if (t.ok && t.items) setTimeline(t.items);
        if (p.ok && p.items) setProviders(p.items);
        if (d.ok && d.items) setDocuments(d.items);
        if (f.ok && f.item) setFinancial(f.item);
        if (b.ok && b.items) setBillLines(b.items);
        if (i.ok && i.insights) setInsights(i.insights);
        if (!c.ok) setError((c as { error?: string }).error ?? "Case not found");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchExportHistory = useCallback(() => {
    if (!id) return;
    const base = getApiBase();
    fetch(`${base}/cases/${id}/export-packet/history`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        if (isExportHistoryResponse(res) && res.ok && Array.isArray(res.items)) setExportHistory(res.items);
      })
      .catch(() => {});
  }, [id]);

  const rebuildChronology = useCallback(() => {
    if (!id) return;
    const base = getApiBase();
    setChronologyRebuilding(true);
    fetch(`${base}/cases/${id}/timeline/rebuild`, {
      method: "POST",
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        const r = res as { ok?: boolean; error?: string };
        if (r.ok) {
          return fetch(`${base}/cases/${id}/timeline`, { headers: getAuthHeader() })
            .then(parseJsonResponse)
            .then((tRes: unknown) => {
              const t = tRes as { ok?: boolean; items?: TimelineEvent[] };
              if (t.ok && t.items) setTimeline(t.items);
            });
        }
        setError(r.error ?? "Failed to rebuild chronology");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setChronologyRebuilding(false));
  }, [id]);

  const runSummarize = useCallback(() => {
    if (!id) return;
    const base = getApiBase();
    setSummarizeError(null);
    setSummarizeResult(null);
    setSummarizeLoading(true);
    fetch(`${base}/cases/${id}/summarize`, {
      method: "POST",
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        const r = res as { ok?: boolean; error?: string; body?: string; sections?: unknown; documentSummaries?: unknown[]; hasContent?: boolean };
        if (r.ok && r.body != null) {
          setSummarizeResult({
            body: r.body,
            sections: (r.sections ?? { conciseNarrative: "", injuries: [], providersInvolved: [], treatmentTimelineSummary: "", latestOffer: null }) as {
              conciseNarrative: string;
              injuries: string[];
              providersInvolved: string[];
              treatmentTimelineSummary: string;
              latestOffer: { amount: number; date: string; source?: string } | null;
            },
            documentSummaries: Array.isArray(r.documentSummaries) ? r.documentSummaries as { documentId: string; originalName: string | null; summary: string }[] : [],
            hasContent: r.hasContent ?? true,
          });
        } else {
          setSummarizeError(r.error ?? "No summary returned");
        }
      })
      .catch((e) => setSummarizeError(e?.message ?? "Request failed"))
      .finally(() => setSummarizeLoading(false));
  }, [id]);

  const runExtract = useCallback(() => {
    if (!id) return;
    const base = getApiBase();
    setExtractError(null);
    setExtractResult(null);
    setExtractLoading(true);
    fetch(`${base}/cases/${id}/extract-entities`, {
      method: "POST",
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        const r = res as { ok?: boolean; error?: string; providers?: unknown[]; dates?: unknown[]; costs?: unknown[]; hasContent?: boolean };
        if (r.ok && Array.isArray(r.providers)) {
          setExtractResult({
            providers: r.providers as { name: string; source: string }[],
            dates: Array.isArray(r.dates) ? (r.dates as { date: string; label: string; source?: string }[]) : [],
            costs: Array.isArray(r.costs) ? (r.costs as { amount: number; label: string; source?: string }[]) : [],
            hasContent: r.hasContent ?? true,
          });
        } else {
          setExtractError(r.error ?? "No data returned");
        }
      })
      .catch((e) => setExtractError(e?.message ?? "Request failed"))
      .finally(() => setExtractLoading(false));
  }, [id]);

  const runMissingRecords = useCallback(() => {
    if (!id) return;
    const base = getApiBase();
    setMissingError(null);
    setMissingResult(null);
    setMissingLoading(true);
    fetch(`${base}/cases/${id}/identify-missing-records`, {
      method: "POST",
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        const r = res as {
          ok?: boolean;
          error?: string;
          flags?: unknown[];
          hasEvidence?: boolean;
          message?: string;
        };
        if (r.ok && Array.isArray(r.flags)) {
          setMissingResult({
            flags: r.flags as {
              category: string;
              reason: string;
              confidence?: string;
              providerName?: string | null;
              recordsRequestId?: string | null;
            }[],
            hasEvidence: r.hasEvidence ?? true,
            message: r.message,
          });
        } else {
          setMissingError(r.error ?? "No result returned");
        }
      })
      .catch((e) => setMissingError(e?.message ?? "Request failed"))
      .finally(() => setMissingLoading(false));
  }, [id]);

  const runCompare = useCallback(() => {
    if (!id) return;
    const base = getApiBase();
    setCompareError(null);
    setCompareResult(null);
    setCompareLoading(true);
    fetch(`${base}/cases/${id}/compare-bills-treatment`, {
      method: "POST",
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        const r = res as {
          ok?: boolean;
          error?: string;
          flags?: unknown[];
          hasEvidence?: boolean;
          message?: string;
        };
        if (r.ok && Array.isArray(r.flags)) {
          setCompareResult({
            flags: r.flags as {
              category: string;
              reason: string;
              confidence?: string;
              providerName?: string | null;
              documentId?: string | null;
              dateContext?: string | null;
            }[],
            hasEvidence: r.hasEvidence ?? true,
            message: r.message,
          });
        } else {
          setCompareError(r.error ?? "No result returned");
        }
      })
      .catch((e) => setCompareError(e?.message ?? "Request failed"))
      .finally(() => setCompareLoading(false));
  }, [id]);

  const runDraft = useCallback(
    (sectionKey?: string) => {
      if (!id) return;
      const base = getApiBase();
      const key = sectionKey ?? draftSectionKey;
      setDraftError(null);
      setDraftResult(null);
      setDraftLoading(true);
      fetch(`${base}/cases/${id}/draft-demand-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ sectionKey: key }),
      })
        .then(parseJsonResponse)
        .then((res: unknown) => {
          const r = res as {
            ok?: boolean;
            error?: string;
            sectionKey?: string;
            title?: string;
            draftText?: string;
            warnings?: string[];
          };
          if (r.ok && r.draftText != null) {
            setDraftResult({
              sectionKey: r.sectionKey ?? key,
              title: r.title ?? "Draft",
              draftText: r.draftText,
              warnings: Array.isArray(r.warnings) ? r.warnings : undefined,
            });
          } else {
            setDraftError(r.error ?? "No draft returned");
          }
        })
        .catch((e) => setDraftError(e?.message ?? "Request failed"))
        .finally(() => setDraftLoading(false));
    },
    [id, draftSectionKey]
  );

  const runAnswerQuestion = useCallback(() => {
    if (!id) return;
    const q = questionInput.trim();
    if (!q) return;
    const base = getApiBase();
    setAnswerError(null);
    setAnswerResult(null);
    setAnswerLoading(true);
    fetch(`${base}/cases/${id}/answer-question`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      ...getFetchOptions(),
      body: JSON.stringify({ question: q }),
    })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        const r = res as {
          ok?: boolean;
          error?: string;
          answer?: string;
          sourcesUsed?: string[];
          warnings?: string[];
        };
        if (r.ok && r.answer != null) {
          setAnswerResult({
            answer: r.answer,
            sourcesUsed: Array.isArray(r.sourcesUsed) ? r.sourcesUsed : [],
            warnings: Array.isArray(r.warnings) && r.warnings.length > 0 ? r.warnings : undefined,
          });
        } else {
          setAnswerError(r.error ?? "No answer returned");
        }
      })
      .catch((e) => setAnswerError(e?.message ?? "Request failed"))
      .finally(() => setAnswerLoading(false));
  }, [id, questionInput]);

  useEffect(() => {
    if (caseData?.id) fetchExportHistory();
  }, [caseData?.id, fetchExportHistory]);

  const startExport = useCallback(
    async (destinations: ("download_bundle" | "cloud_drive")[]) => {
      if (!id) return;
      const base = getApiBase();
      setExportMessage(null);
      setExporting(destinations.join(","));
      try {
        const res = await fetch(`${base}/cases/${id}/export-packet`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          ...getFetchOptions(),
          body: JSON.stringify({
            destinations,
            packetType,
            includeTimeline: true,
            includeSummary: false,
          }),
        });
        const data = await parseJsonResponse(res);
        if (!res.ok) {
          setExportMessage((data as { error?: string })?.error ?? "Export failed");
          return;
        }
        const job = data as { jobId?: string };
        if (destinations.includes("download_bundle")) {
          setExportMessage("Export started. When ready, the ZIP will appear in Export history below.");
          setTimeout(fetchExportHistory, 2000);
        } else {
          setExportMessage("Export started. Files are being written to your cloud drive (by case and document category).");
        }
      } catch (e) {
        setExportMessage((e as Error)?.message ?? "Request failed");
      } finally {
        setExporting(null);
      }
    },
    [id, packetType, fetchExportHistory]
  );

  const timelineItems: TimelineItem[] = (() => {
    let list = timeline;
    if (trackFilter && trackFilter !== "all") list = list.filter((e) => e.track === trackFilter);
    if (providerFilter.trim()) list = list.filter((e) => e.provider?.toLowerCase().includes(providerFilter.trim().toLowerCase()));
    const withDate = list.filter((e) => e.eventDate != null);
    const withoutDate = list.filter((e) => e.eventDate == null);
    const sorted = [
      ...withDate.sort((a, b) => new Date(a.eventDate!).getTime() - new Date(b.eventDate!).getTime()),
      ...withoutDate,
    ];
    return sorted.map((e) => ({
      id: e.id,
      date: e.eventDate ? new Date(e.eventDate).toLocaleDateString() : "Date unknown",
      title: e.eventType || "Event",
      description: [e.provider, e.diagnosis, e.procedure].filter(Boolean).join(" · ") || undefined,
      meta: e.amount != null ? `$${Number(e.amount).toLocaleString()}` : undefined,
      dateUncertain: (e.eventDate == null || (e.metadataJson && (e.metadataJson as { dateUncertain?: boolean }).dateUncertain)) ?? undefined,
    }));
  })();

  const uniqueTimelineProviders = Array.from(new Set(timeline.map((e) => e.provider).filter(Boolean))) as string[];

  const isLoading = loading && !caseData;
  const isError = error || !caseData;
  const title = caseData ? (caseData.clientName || caseData.title || caseData.caseNumber || "Case") : "";
  const errorMsgStyle = { margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" } as const;
  const insufficientStyle = { margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" } as const;
  const sourcesLabelStyle = { margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" } as const;

  return (
    <>
      {isLoading && (
        <div style={{ padding: "1.5rem" }}>
          <PageHeader breadcrumbs={[{ label: "Cases", href: "/dashboard/cases" }, { label: "…" }]} title="Case" description="Loading…" />
        </div>
      )}
      {!isLoading && isError && (
        <div style={{ padding: "1.5rem" }}>
          <PageHeader breadcrumbs={[{ label: "Cases", href: "/dashboard/cases" }]} title="Case" />
          <div className="onyx-card" style={{ padding: "1rem", borderColor: "var(--onyx-error)" }}>
            <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error ?? "Case not found."}</p>
            <Link href="/dashboard/cases" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem" }}>Back to cases</Link>
          </div>
        </div>
      )}
      {!isLoading && !isError && caseData && (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Cases", href: "/dashboard/cases" }, { label: title }]}
        title={title}
        description={caseData.caseNumber ? `Case #${caseData.caseNumber}` : undefined}
      />

      {/* AI actions */}
      <div
        className="onyx-card"
        style={{
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)", marginRight: "0.5rem" }}>Case AI actions</span>
        <span style={{ fontSize: "0.7rem", color: "var(--onyx-text-muted)", marginRight: "0.5rem" }}>Run in order for best results: Build chronology → Summarize → Extract → then Missing records, Compare, Draft, Q&A.</span>
        {AI_ACTIONS.map((a) => {
          const isDisabled =
            a.comingSoon ||
            (a.id === "chronology" && chronologyRebuilding) ||
            (a.id === "summarize" && summarizeLoading) ||
            (a.id === "extract" && extractLoading) ||
            (a.id === "missing" && missingLoading) ||
            (a.id === "compare" && compareLoading) ||
            (a.id === "draft" && draftLoading) ||
            (a.id === "qa" && answerLoading);
          const handleClick =
            a.id === "chronology" && !a.comingSoon
              ? () => rebuildChronology()
              : a.id === "summarize" && !a.comingSoon
                ? () => runSummarize()
                : a.id === "extract" && !a.comingSoon
                  ? () => runExtract()
                  : a.id === "missing" && !a.comingSoon
                    ? () => runMissingRecords()
                    : a.id === "compare" && !a.comingSoon
                      ? () => runCompare()
                      : a.id === "draft" && !a.comingSoon
                        ? () => runDraft()
                        : a.id === "qa" && !a.comingSoon
                          ? () => document.getElementById("case-answer-question-card")?.scrollIntoView({ behavior: "smooth" })
                          : undefined;
          const buttonLabel =
            a.id === "chronology" && chronologyRebuilding
              ? "Rebuilding…"
              : a.id === "summarize" && summarizeLoading
                ? "Summarizing…"
                : a.id === "extract" && extractLoading
                  ? "Extracting…"
                  : a.id === "missing" && missingLoading
                    ? "Identifying…"
                    : a.id === "compare" && compareLoading
                      ? "Comparing…"
                      : a.id === "draft" && draftLoading
                        ? "Drafting…"
                        : a.id === "qa" && answerLoading
                          ? "Answering…"
                          : a.comingSoon
                            ? `${a.label} (coming soon)`
                            : a.label;
          return (
            <button
              key={a.id}
              type="button"
              className="onyx-btn-secondary"
              style={{
                padding: "0.35rem 0.75rem",
                fontSize: "0.8125rem",
                opacity: isDisabled ? 0.7 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
              }}
              disabled={isDisabled}
              title={a.comingSoon ? "Coming soon" : undefined}
              onClick={handleClick}
            >
              {buttonLabel}
            </button>
          );
        })}
      </div>

      {/* AI action results */}
      {(summarizeResult || summarizeError) && (
        <DashboardCard title="Packet summary" style={{ marginBottom: "1rem" }}>
          {summarizeError && <p style={errorMsgStyle}>{summarizeError}</p>}
          {summarizeResult && !summarizeError && (
            <>
              {!summarizeResult.hasContent && <p style={insufficientStyle}>Not enough data yet. Build chronology and add documents, then run Summarize.</p>}
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.8125rem", margin: 0, padding: 0 }}>{summarizeResult.body}</pre>
              {summarizeResult.documentSummaries.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Document summaries</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>
                    {summarizeResult.documentSummaries.map((doc) => (
                      <li key={doc.documentId} style={{ marginBottom: "0.35rem" }}>
                        <strong>{doc.originalName ?? doc.documentId}</strong>: {doc.summary}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DashboardCard>
      )}
      {(extractResult || extractError) && (
        <DashboardCard title="Providers, dates & costs" style={{ marginBottom: "1rem" }}>
          {extractError && <p style={errorMsgStyle}>{extractError}</p>}
          {extractResult && !extractError && (
            <>
              {!extractResult.hasContent && <p style={insufficientStyle}>Not enough data yet. Build chronology and add documents, then run Extract.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
                <div>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Providers</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{extractResult.providers.length === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : extractResult.providers.map((p, i) => <li key={i}>{p.name}</li>)}</ul>
                </div>
                <div>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Dates</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{extractResult.dates.length === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : extractResult.dates.slice(0, 15).map((d, i) => <li key={i}>{d.date} — {d.label}</li>)}</ul>
                  {extractResult.dates.length > 15 && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>+{extractResult.dates.length - 15} more</p>}
                </div>
                <div>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Costs</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{extractResult.costs.length === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : extractResult.costs.slice(0, 15).map((c, i) => <li key={i}>${Number(c.amount).toLocaleString()} — {c.label}</li>)}</ul>
                  {extractResult.costs.length > 15 && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>+{extractResult.costs.length - 15} more</p>}
                </div>
              </div>
            </>
          )}
        </DashboardCard>
      )}

      {(missingResult || missingError) && (
        <DashboardCard title="Missing records" style={{ marginBottom: "1rem" }}>
          {missingError && <p style={errorMsgStyle}>{missingError}</p>}
          {missingResult && !missingError && (
            <>
              {!missingResult.hasEvidence && (
                <p style={insufficientStyle}>
                  {missingResult.message ?? "Not enough data yet. Add documents and build chronology, then run Identify missing records."}
                </p>
              )}
              {missingResult.hasEvidence && missingResult.flags.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No gaps flagged for this case. Re-run after adding documents if needed.
                </p>
              )}
              {missingResult.hasEvidence && missingResult.flags.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                  {missingResult.flags.map((f, i) => (
                    <li key={i} style={{ marginBottom: "0.5rem" }}>
                      <span
                        className={
                          f.confidence === "high"
                            ? "onyx-badge-error"
                            : f.confidence === "medium"
                              ? "onyx-badge-warning"
                              : "onyx-badge-info"
                        }
                        style={{ marginRight: "0.35rem" }}
                      >
                        {f.confidence ?? "low"}
                      </span>
                      {f.reason}
                      {f.recordsRequestId && (
                        <span style={{ color: "var(--onyx-text-muted)", marginLeft: "0.35rem" }}>
                          <Link href={`/dashboard/records-requests/${f.recordsRequestId}`} className="onyx-link" style={{ fontSize: "0.8125rem" }}>
                            View request →
                          </Link>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </DashboardCard>
      )}

      {(compareResult || compareError) && (
        <DashboardCard title="Bills vs treatment" style={{ marginBottom: "1rem" }}>
          {compareError && <p style={errorMsgStyle}>{compareError}</p>}
          {compareResult && !compareError && (
            <>
              {!compareResult.hasEvidence && (
                <p style={insufficientStyle}>
                  {compareResult.message ?? "Not enough data yet. Build chronology and add documents, then run Compare bills to treatment."}
                </p>
              )}
              {compareResult.hasEvidence && compareResult.flags.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No mismatches flagged. Re-run after adding documents if needed.
                </p>
              )}
              {compareResult.hasEvidence && compareResult.flags.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                  {compareResult.flags.map((f, i) => (
                    <li key={i} style={{ marginBottom: "0.5rem" }}>
                      <span
                        className={
                          f.confidence === "high"
                            ? "onyx-badge-error"
                            : f.confidence === "medium"
                              ? "onyx-badge-warning"
                              : "onyx-badge-info"
                        }
                        style={{ marginRight: "0.35rem" }}
                      >
                        {f.confidence ?? "low"}
                      </span>
                      {f.reason}
                      {f.dateContext && <span style={{ color: "var(--onyx-text-muted)", marginLeft: "0.25rem" }}>({f.dateContext})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </DashboardCard>
      )}

      {(draftResult || draftError || draftLoading) && (
        <DashboardCard title="Draft demand section" style={{ marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Draft for review only. Edit before use in any demand.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
            <label style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Section:</label>
            <select
              value={draftSectionKey}
              onChange={(e) => setDraftSectionKey(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 200, fontSize: "0.8125rem" }}
              disabled={draftLoading}
            >
              <option value="treatment_summary">Treatment Summary</option>
              <option value="medical_specials">Medical Specials Summary</option>
              <option value="records_overview">Records / Bills Overview</option>
              <option value="pending_records">Gaps / Pending Records Note</option>
            </select>
            <button
              type="button"
              className="onyx-btn-primary"
              disabled={draftLoading}
              onClick={() => runDraft()}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
            >
              {draftLoading ? "Generating…" : "Generate draft"}
            </button>
          </div>
          {draftError && <p style={errorMsgStyle}>{draftError}</p>}
          {draftResult && !draftError && (
            <>
              {draftResult.warnings && draftResult.warnings.length > 0 && (
                <p style={insufficientStyle}>
                  {draftResult.warnings.join(" ")}
                </p>
              )}
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>{draftResult.title}</p>
              <textarea
                readOnly
                value={draftResult.draftText}
                style={{
                  width: "100%",
                  minHeight: 180,
                  fontSize: "0.875rem",
                  fontFamily: "inherit",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--onyx-border)",
                  borderRadius: "var(--onyx-radius-sm)",
                  resize: "vertical",
                  background: "var(--onyx-background-surface)",
                }}
              />
            </>
          )}
        </DashboardCard>
      )}

      <div id="case-answer-question-card">
        <DashboardCard title="Answer questions about the case" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
          Ask a practical question (timeline, providers, costs, missing records, bills vs treatment). Answers are grounded in case data only—not legal advice.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            placeholder="e.g. Who are the providers? What are the total costs?"
            className="onyx-input"
            style={{ flex: "1", minWidth: 220, fontSize: "0.875rem" }}
            disabled={answerLoading}
            onKeyDown={(e) => e.key === "Enter" && !answerLoading && questionInput.trim() && runAnswerQuestion()}
          />
          <button
            type="button"
            className="onyx-btn-primary"
            disabled={answerLoading || !questionInput.trim()}
            onClick={() => runAnswerQuestion()}
            style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
          >
            {answerLoading ? "Answering…" : "Ask"}
          </button>
        </div>
        {answerError && <p style={errorMsgStyle}>{answerError}</p>}
        {answerResult && !answerError && (
          <>
            {answerResult.warnings && answerResult.warnings.length > 0 && (
              <p style={insufficientStyle}>
                {answerResult.warnings.join(" ")}
              </p>
            )}
            <div style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{answerResult.answer}</div>
            {answerResult.sourcesUsed.length > 0 && (
              <p style={sourcesLabelStyle}>
                Grounded from: {answerResult.sourcesUsed.join(", ")}
              </p>
            )}
          </>
        )}
      </DashboardCard>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "2px", marginBottom: "1.25rem", flexWrap: "wrap", borderBottom: "1px solid var(--onyx-border-subtle)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "0.5rem 0.875rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: activeTab === tab.id ? "var(--onyx-text)" : "var(--onyx-text-muted)",
              background: activeTab === tab.id ? "var(--onyx-accent-muted)" : "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid var(--onyx-accent)" : "2px solid transparent",
              marginBottom: "-1px",
              cursor: "pointer",
              borderRadius: "var(--onyx-radius-sm) var(--onyx-radius-sm) 0 0",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <DashboardCard title="Client info">
          <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Client:</strong> {caseData.clientName ?? "—"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Case #:</strong> {caseData.caseNumber ?? "—"}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Created:</strong> {new Date(caseData.createdAt).toLocaleDateString()}</p>
        </DashboardCard>
        {financial && (
          <DashboardCard title="Billing summary">
            <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Medical bills total:</strong> ${Number(financial.medicalBillsTotal).toLocaleString()}</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Liens:</strong> ${Number(financial.liensTotal).toLocaleString()}</p>
            {financial.settlementOffer != null && (
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Settlement offer:</strong> ${Number(financial.settlementOffer).toLocaleString()}</p>
            )}
          </DashboardCard>
        )}
        {billLines.length > 0 && (
          <DashboardCard title="Bill line items">
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>{billLines.length} line(s)</p>
            <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse", marginTop: "0.5rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--onyx-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Provider</th>
                  <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Date</th>
                  <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {billLines.slice(0, 5).map((line) => (
                  <tr key={line.id} style={{ borderBottom: "1px solid var(--onyx-border)" }}>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{line.providerName ?? "—"}</td>
                    <td style={{ padding: "0.25rem 0.5rem" }}>{line.serviceDate ? new Date(line.serviceDate).toLocaleDateString() : "—"}</td>
                    <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{line.lineTotal != null ? `$${Number(line.lineTotal).toLocaleString()}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {billLines.length > 5 && <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>+{billLines.length - 5} more</p>}
          </DashboardCard>
        )}
        <DashboardCard title="Counts">
          <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Providers:</strong> {providers.length}</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Documents:</strong> {documents.length}</p>
        </DashboardCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <DashboardCard title="Providers">
          {providers.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No providers linked.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
              {providers.map((p) => (
                <li key={p.id} style={{ marginBottom: "0.25rem" }}>
                  <Link href={`/dashboard/providers/${p.providerId}`} className="onyx-link">{p.provider?.name ?? p.providerId}</Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
        <div />
      </div>

      {insights.length > 0 && (
        <DashboardCard title="AI insights" style={{ marginTop: "1rem" }}>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
            {insights.map((ins, i) => (
              <li key={i} style={{ marginBottom: "0.5rem" }}>
                <span className={ins.severity === "high" ? "onyx-badge-error" : ins.severity === "medium" ? "onyx-badge-warning" : "onyx-badge-info"} style={{ marginRight: "0.5rem" }}>{ins.severity}</span>
                {ins.title}
                {ins.detail && <span style={{ color: "var(--onyx-text-muted)" }}> — {ins.detail}</span>}
              </li>
            ))}
          </ul>
        </DashboardCard>
      )}

      </>
      )}

      {activeTab === "chronology" && (
        <DashboardCard title="Treatment timeline">
          <div style={{ marginBottom: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Track:</label>
            <select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)} className="onyx-input" style={{ minWidth: 120, fontSize: "0.8125rem" }}>
              <option value="all">All</option>
              <option value="medical">Medical</option>
              <option value="legal">Legal</option>
              <option value="insurance">Insurance</option>
            </select>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, marginLeft: "0.5rem" }}>Provider:</label>
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="onyx-input" style={{ minWidth: 140, fontSize: "0.8125rem" }}>
              <option value="">All providers</option>
              {uniqueTimelineProviders.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          {timelineItems.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No timeline events yet.</p>
          ) : (
            <Timeline items={timelineItems} />
          )}
        </DashboardCard>
      )}

      {activeTab === "medical-bills" && (
        <>
          {compareResult != null && (
            <DashboardCard title="Bills vs treatment" style={{ marginBottom: "1rem" }}>
              {!compareResult.hasEvidence && (
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  {compareResult.message ?? "Build chronology and add documents, then run Compare bills to treatment above."}
                </p>
              )}
              {compareResult.hasEvidence && compareResult.flags.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No bill vs treatment mismatches flagged. Run &quot;Compare bills to treatment&quot; in the AI actions bar to refresh.
                </p>
              )}
              {compareResult.hasEvidence && compareResult.flags.length > 0 && (
                <>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>
                    {compareResult.flags.length} potential mismatch(es) — review as needed
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                    {compareResult.flags.map((f, i) => (
                      <li key={i} style={{ marginBottom: "0.5rem" }}>
                        <span
                          className={
                            f.confidence === "high"
                              ? "onyx-badge-error"
                              : f.confidence === "medium"
                                ? "onyx-badge-warning"
                                : "onyx-badge-info"
                          }
                          style={{ marginRight: "0.35rem" }}
                        >
                          {f.confidence ?? "low"}
                        </span>
                        {f.reason}
                        {f.dateContext && <span style={{ color: "var(--onyx-text-muted)", marginLeft: "0.25rem" }}>({f.dateContext})</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DashboardCard>
          )}
          {financial && (
            <DashboardCard title="Billing summary" style={{ marginBottom: "1rem" }}>
              <p style={{ margin: 0, fontSize: "0.875rem" }}><strong>Medical bills total:</strong> ${Number(financial.medicalBillsTotal).toLocaleString()}</p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Liens:</strong> ${Number(financial.liensTotal).toLocaleString()}</p>
              {financial.settlementOffer != null && <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem" }}><strong>Settlement offer:</strong> ${Number(financial.settlementOffer).toLocaleString()}</p>}
            </DashboardCard>
          )}
          {billLines.length > 0 ? (
            <DashboardCard title="Bill line items">
              <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--onyx-border)" }}>
                    <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Provider</th>
                    <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Date</th>
                    <th style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {billLines.map((line) => (
                    <tr key={line.id} style={{ borderBottom: "1px solid var(--onyx-border)" }}>
                      <td style={{ padding: "0.25rem 0.5rem" }}>{line.providerName ?? "—"}</td>
                      <td style={{ padding: "0.25rem 0.5rem" }}>{line.serviceDate ? new Date(line.serviceDate).toLocaleDateString() : "—"}</td>
                      <td style={{ textAlign: "right", padding: "0.25rem 0.5rem" }}>{line.lineTotal != null ? `$${Number(line.lineTotal).toLocaleString()}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DashboardCard>
          ) : (
            <DashboardCard title="Bill line items"><p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No bill line items yet.</p></DashboardCard>
          )}
          {compareResult == null && (
            <p style={{ margin: "1rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
              Run &quot;Compare bills to treatment&quot; in the AI actions bar to check for bill vs treatment mismatches.
            </p>
          )}
        </>
      )}

      {activeTab === "missing-records" && (
        <DashboardCard title="Missing records">
          {missingResult != null ? (
            <>
              {!missingResult.hasEvidence && (
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  {missingResult.message ?? "No timeline, providers, or documents for this case. Add documents and build chronology, then run Identify missing records above."}
                </p>
              )}
              {missingResult.hasEvidence && missingResult.flags.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No likely missing records flagged. Run &quot;Identify missing records&quot; in the AI actions bar to refresh.
                </p>
              )}
              {missingResult.hasEvidence && missingResult.flags.length > 0 && (
                <>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>
                    {missingResult.flags.length} potential gap(s) — review and request as needed
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                    {missingResult.flags.map((f, i) => (
                      <li key={i} style={{ marginBottom: "0.5rem" }}>
                        <span
                          className={
                            f.confidence === "high"
                              ? "onyx-badge-error"
                              : f.confidence === "medium"
                                ? "onyx-badge-warning"
                                : "onyx-badge-info"
                          }
                          style={{ marginRight: "0.35rem" }}
                        >
                          {f.confidence ?? "low"}
                        </span>
                        {f.reason}
                        {f.recordsRequestId && (
                          <span style={{ marginLeft: "0.35rem" }}>
                            <Link href={`/dashboard/records-requests/${f.recordsRequestId}`} className="onyx-link" style={{ fontSize: "0.8125rem" }}>
                              View request →
                            </Link>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              Run &quot;Identify missing records&quot; in the AI actions bar above to surface gaps in treatment or billing for this case.
            </p>
          )}
        </DashboardCard>
      )}

      {activeTab === "demands" && (
        <DashboardCard title="Demands">
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Generate a draft section from case data. Run Summarize, Extract, and Build chronology first for better drafts. Outputs are for review only.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
            <label style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Section:</label>
            <select
              value={draftSectionKey}
              onChange={(e) => setDraftSectionKey(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 200, fontSize: "0.8125rem" }}
              disabled={draftLoading}
            >
              <option value="treatment_summary">Treatment Summary</option>
              <option value="medical_specials">Medical Specials Summary</option>
              <option value="records_overview">Records / Bills Overview</option>
              <option value="pending_records">Gaps / Pending Records Note</option>
            </select>
            <button
              type="button"
              className="onyx-btn-primary"
              disabled={draftLoading}
              onClick={() => runDraft()}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
            >
              {draftLoading ? "Generating…" : "Generate draft"}
            </button>
          </div>
          {draftResult && (
            <>
              {draftResult.warnings && draftResult.warnings.length > 0 && (
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>{draftResult.warnings.join(" ")}</p>
              )}
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>{draftResult.title}</p>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: "0.875rem",
                  padding: "0.75rem",
                  border: "1px solid var(--onyx-border)",
                  borderRadius: "var(--onyx-radius-sm)",
                  background: "var(--onyx-background-surface)",
                  maxHeight: 400,
                  overflowY: "auto",
                }}
              >
                {draftResult.draftText}
              </div>
            </>
          )}
          {!draftResult && !draftLoading && (
            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>Choose a section and click Generate draft to create an editable first draft from case data.</p>
          )}
        </DashboardCard>
      )}

      {activeTab === "tasks" && (
        <DashboardCard title="Tasks">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Case tasks and to-dos. Use Case AI actions above for chronology, demands, and Q&A.</p>
        </DashboardCard>
      )}

      {activeTab === "activity" && (
        <DashboardCard title="Activity">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Activity log for this case. Updates as documents and timeline change.</p>
        </DashboardCard>
      )}

      {activeTab === "contacts" && (
        <DashboardCard title="Contacts">
          {providers.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No providers linked.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
              {providers.map((p) => (
                <li key={p.id} style={{ marginBottom: "0.25rem" }}>
                  <Link href={`/dashboard/providers/${p.providerId}`} className="onyx-link">{p.provider?.name ?? p.providerId}</Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      )}

      {activeTab === "notes" && (
        <DashboardCard title="Notes">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Case notes. Add notes here as you work the case.</p>
        </DashboardCard>
      )}

      {activeTab === "documents" && (
      <>
      <DashboardCard title="Export" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          Export case documents using your firm&apos;s naming and folder rules. Include timeline when available.
        </p>
        {documents.length === 0 && (
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
            Add documents to this case to enable export.
          </p>
        )}
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Packet type</label>
          <select
            value={packetType}
            onChange={(e) => setPacketType(e.target.value as "records" | "bills" | "combined")}
            className="onyx-input"
            style={{ minWidth: 160 }}
          >
            <option value="combined">Combined (all documents)</option>
            <option value="records">Records packet (medical/legal records only)</option>
            <option value="bills">Bills packet (billing, EOB, ledgers only)</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => startExport(["download_bundle"])}
            disabled={!!exporting || documents.length === 0}
            className="onyx-btn-primary"
          >
            {exporting === "download_bundle" ? "Starting…" : "Download ZIP"}
          </button>
          <button
            type="button"
            onClick={() => startExport(["cloud_drive"])}
            disabled={!!exporting || documents.length === 0}
            className="onyx-btn-secondary"
          >
            {exporting === "cloud_drive" ? "Starting…" : "Export to cloud drive"}
          </button>
        </div>
        {exportMessage && (
          <p
            style={{
              margin: "0.75rem 0 0",
              fontSize: "0.8125rem",
              color: exportMessage.startsWith("Export started") ? "var(--onyx-success)" : "var(--onyx-text-muted)",
            }}
          >
            {exportMessage}
          </p>
        )}
        {exportHistory.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Export history</p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
              {exportHistory.slice(0, 5).map((e) => (
                <li key={e.id} style={{ marginBottom: "0.25rem" }}>
                  <a
                    href={`${getApiBase()}/packet-exports/${e.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="onyx-link"
                  >
                    {e.fileName}
                  </a>
                  <span style={{ marginLeft: "0.5rem", color: "var(--onyx-text-muted)", fontSize: "0.8125rem" }}>
                    {e.packetType === "records" ? "Records" : e.packetType === "bills" ? "Bills" : "Combined"}
                    {" · "}
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Documents" style={{ marginTop: "1rem" }}>
        {documents.length === 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No documents yet.</p>
        ) : (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.8125rem" }}>
              <input
                type="checkbox"
                checked={groupDocsByProvider}
                onChange={(e) => setGroupDocsByProvider(e.target.checked)}
              />
              Group by provider (from timeline)
            </label>
            {groupDocsByProvider ? (
              (() => {
                const byProvider = new Map<string, Doc[]>();
                for (const d of documents) {
                  const key = d.providerName?.trim() || "— No provider";
                  if (!byProvider.has(key)) byProvider.set(key, []);
                  byProvider.get(key)!.push(d);
                }
                const keys = Array.from(byProvider.keys()).sort((a, b) => (a === "— No provider" ? 1 : b === "— No provider" ? -1 : a.localeCompare(b)));
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {keys.map((providerName) => (
                      <div key={providerName}>
                        <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>{providerName}</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {byProvider.get(providerName)!.slice(0, 10).map((d) => (
                            <DocumentPreview key={d.id} id={d.id} name={d.originalName} status={d.status} pageCount={d.pageCount ?? undefined} showPreview={true} />
                          ))}
                          {(byProvider.get(providerName)!.length ?? 0) > 10 && (
                            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>+{byProvider.get(providerName)!.length! - 10} more</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {documents.slice(0, 10).map((d) => (
                  <DocumentPreview key={d.id} id={d.id} name={d.originalName} status={d.status} pageCount={d.pageCount ?? undefined} showPreview={true} />
                ))}
                {documents.length > 10 && <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>+{documents.length - 10} more</p>}
              </div>
            )}
          </>
        )}
      </DashboardCard>
      </>
      )}
    </div>
      )}
    </>
  );
}
