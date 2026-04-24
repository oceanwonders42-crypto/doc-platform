"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ErrorNotice } from "@/components/dashboard/ErrorNotice";
import { Timeline, TimelineItem } from "@/components/dashboard/Timeline";
import { DocumentPreview } from "@/components/dashboard/DocumentPreview";

type CaseHandoffHistoryItem = {
  exportId: string;
  exportedAt: string;
  exportType: "single_case" | "batch";
  exportSubtype: "contacts" | "matters" | "combined_batch";
  actorLabel: string | null;
  archiveFileName: string | null;
  contactsFileName: string | null;
  mattersFileName: string | null;
  isReExport?: boolean;
};

type CaseItem = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
  createdAt: string;
  clioHandoff?: {
    alreadyExported: boolean;
    exportCount: number;
    lastExportedAt: string | null;
    lastExportType: "single_case" | "batch" | null;
    lastExportSubtype: "contacts" | "matters" | "combined_batch" | null;
    lastExportWasReExport?: boolean;
    lastActorLabel: string | null;
  };
  clioHandoffHistory?: CaseHandoffHistoryItem[];
};
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
type Doc = {
  id: string;
  originalName: string;
  status: string;
  reviewState?: string | null;
  pageCount: number | null;
  createdAt?: string;
  routedCaseId?: string | null;
  providerName?: string | null;
};
type Financial = { medicalBillsTotal: number; liensTotal: number; settlementOffer: number | null };
type Insight = { type: string; severity: string; title: string; detail: string | null };
type BillLine = { id: string; documentId: string; providerName: string | null; serviceDate: string | null; amountCharged: number | null; balance: number | null; lineTotal: number | null };

function parseFileName(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? fallback;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return fallback;
  try {
    const data = JSON.parse(text) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return text.slice(0, 200);
  }
}

function createClioIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `clio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function CaseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const caseApiBase = id ? `/api/cases/${encodeURIComponent(id)}` : "";

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
  const [allowClioReexport, setAllowClioReexport] = useState(false);
  const [chronologyRebuilding, setChronologyRebuilding] = useState(false);
  const [chronologyExporting, setChronologyExporting] = useState<"pdf" | "docx" | null>(null);
  const summarizeLoading = false;
  const summarizeResult = null as {
    body: string;
    sections: {
      conciseNarrative: string;
      injuries: string[];
      providersInvolved: string[];
      treatmentTimelineSummary: string;
      latestOffer: { amount: number; date: string; source?: string } | null;
    };
    documentSummaries: { documentId: string; originalName: string | null; summary: string }[];
    hasContent: boolean;
  } | null;
  const summarizeError = null as string | null;
  const extractLoading = false;
  const extractError = null as string | null;
  const missingLoading = false;
  const missingError = null as string | null;
  const compareLoading = false;
  const compareError = null as string | null;
  const [draftSectionKey, setDraftSectionKey] = useState<string>("treatment_summary");
  const draftLoading = false;
  const draftError = null as string | null;
  const [questionInput, setQuestionInput] = useState("");
  const answerLoading = false;
  const answerError = null as string | null;
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
    const tabFromUrl = searchParams?.get("tab");
    if (tabFromUrl && TABS.some((t) => t.id === tabFromUrl)) {
      setActiveTab(tabFromUrl as typeof activeTab);
    }
  }, [searchParams]);

  const AI_ACTIONS = [
    { id: "summarize", label: "Packet summary", comingSoon: true },
    { id: "chronology", label: "Rebuild chronology", comingSoon: false },
    { id: "extract", label: "Entity extraction", comingSoon: true },
    { id: "missing", label: "Missing-records analysis", comingSoon: true },
    { id: "compare", label: "Bills vs treatment review", comingSoon: true },
    { id: "draft", label: "Demand draft", comingSoon: true },
    { id: "qa", label: "Case Q&A", comingSoon: true },
  ];

  useEffect(() => {
    if (!id) return;
    const headers = getAuthHeader();
    const acceptJson = { Accept: "application/json" };
    Promise.all([
      fetch(caseApiBase, { headers: { ...headers, ...acceptJson } }).then(parseJsonResponse),
      fetch(`${caseApiBase}/timeline`, { headers }).then(parseJsonResponse),
      fetch(`${caseApiBase}/providers`, { headers }).then(parseJsonResponse),
      fetch(`${caseApiBase}/documents?includeProvider=true`, { headers }).then(parseJsonResponse),
      fetch(`${caseApiBase}/financial`, { headers }).then(parseJsonResponse),
      fetch(`${caseApiBase}/bill-line-items`, { headers }).then(parseJsonResponse).catch(() => ({ ok: false })),
      fetch(`${caseApiBase}/insights`, { headers }).then(parseJsonResponse).catch(() => ({ ok: false })),
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
  }, [caseApiBase, id]);

  const refreshCaseSummary = useCallback(() => {
    if (!id) return Promise.resolve();
    return fetch(caseApiBase, {
      headers: { ...getAuthHeader(), Accept: "application/json" },
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const data = response as { ok?: boolean; item?: CaseItem };
        if (data.ok && data.item) setCaseData(data.item);
      })
      .catch(() => undefined);
  }, [id]);

  const rebuildChronology = useCallback(() => {
    if (!id) return;
    setChronologyRebuilding(true);
    fetch(`${caseApiBase}/timeline/rebuild`, {
      method: "POST",
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((res: unknown) => {
        const r = res as { ok?: boolean; error?: string };
        if (r.ok) {
          return fetch(`${caseApiBase}/timeline`, { headers: getAuthHeader() })
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
  }, [caseApiBase, id]);

  const runSummarize = useCallback(() => undefined, []);
  const runExtract = useCallback(() => undefined, []);
  const runMissingRecords = useCallback(() => undefined, []);
  const runCompare = useCallback(() => undefined, []);
  const runDraft = useCallback((_sectionKey?: string) => undefined, []);
  const runAnswerQuestion = useCallback(() => undefined, []);

  const startCaseFileExport = useCallback(
    async (kind: "contacts" | "matters" | "offers") => {
      if (!id) return;
      const isClioExport = kind === "contacts" || kind === "matters";
      const config =
        kind === "contacts"
          ? {
              actionLabel: "contacts CSV",
              fallbackFileName: "case-contact.csv",
              endpoint: `${caseApiBase}/exports/clio/contacts.csv`,
              successMessage: "Contacts CSV download started.",
            }
          : kind === "matters"
            ? {
                actionLabel: "matters CSV",
                fallbackFileName: "case-matter.csv",
                endpoint: `${caseApiBase}/exports/clio/matters.csv`,
                successMessage: "Matters CSV download started.",
              }
            : {
                actionLabel: "offers PDF",
                fallbackFileName: `offers-${id}.pdf`,
                endpoint: `${caseApiBase}/offers/export-pdf`,
                successMessage: "Offers PDF download started.",
              };

      setExportMessage(null);
      setExporting(kind);
      try {
        const response = await fetch(config.endpoint, {
          headers: {
            ...getAuthHeader(),
            ...(isClioExport ? { "Idempotency-Key": createClioIdempotencyKey() } : {}),
            ...(isClioExport && allowClioReexport ? { "X-Clio-Reexport": "true" } : {}),
            ...(isClioExport && allowClioReexport ? { "X-Clio-Reexport-Reason": "operator_override" } : {}),
          },
          ...getFetchOptions(),
        });

        if (!response.ok) {
          setExportMessage(await readErrorMessage(response, `Failed to download ${config.actionLabel}.`));
          return;
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = parseFileName(response.headers.get("content-disposition"), config.fallbackFileName);
        anchor.click();
        window.URL.revokeObjectURL(downloadUrl);
        setExportMessage(config.successMessage);
        void refreshCaseSummary();
      } catch (e) {
        setExportMessage((e as Error)?.message ?? "Request failed");
      } finally {
        setExporting(null);
      }
    },
    [allowClioReexport, caseApiBase, id, refreshCaseSummary]
  );

  const startPacketExport = useCallback(async () => {
    if (!id) return;

    setExportMessage(null);
    setExporting("packet");
    try {
      const response = await fetch(`${caseApiBase}/exports/packet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({
          packetType,
          includeTimeline: true,
          includeSummary: false,
        }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) {
        setExportMessage((data as { error?: string })?.error ?? "Failed to export packet.");
        return;
      }

      const result = data as { downloadUrl?: string; fileName?: string | null; documentCount?: number };
      if (!result.downloadUrl) {
        setExportMessage("Packet export completed, but no download URL was returned.");
        return;
      }

      const anchor = document.createElement("a");
      anchor.href = result.downloadUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      if (result.fileName) anchor.download = result.fileName;
      anchor.click();

      const countLabel =
        typeof result.documentCount === "number" && result.documentCount > 0
          ? ` for ${result.documentCount} document${result.documentCount === 1 ? "" : "s"}`
          : "";
      setExportMessage(`Packet export ready${countLabel}. Download should begin now.`);
    } catch (e) {
      setExportMessage((e as Error)?.message ?? "Request failed");
    } finally {
      setExporting(null);
    }
  }, [caseApiBase, id, packetType]);

  const startChronologyExport = useCallback(async (format: "pdf" | "docx") => {
    if (!id) return;

    setExportMessage(null);
    setChronologyExporting(format);
    try {
      const response = await fetch(`${caseApiBase}/timeline/export?format=${format}`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      if (!response.ok) {
        setExportMessage(await readErrorMessage(response, `Failed to export chronology ${format.toUpperCase()}.`));
        return;
      }

      const blob = await response.blob();
      const anchor = document.createElement("a");
      anchor.href = window.URL.createObjectURL(blob);
      anchor.download = parseFileName(
        response.headers.get("content-disposition"),
        `case-chronology.${format}`
      );
      anchor.click();
      window.URL.revokeObjectURL(anchor.href);
      setExportMessage(`Chronology ${format.toUpperCase()} download started.`);
    } catch (e) {
      setExportMessage((e as Error)?.message ?? `Failed to export chronology ${format.toUpperCase()}.`);
    } finally {
      setChronologyExporting(null);
    }
  }, [caseApiBase, id]);

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
  const chronologyPreviewItems = timelineItems.slice(0, 5);

  const uniqueTimelineProviders = Array.from(new Set(timeline.map((e) => e.provider).filter(Boolean))) as string[];
  const totalDocumentCount = documents.length;
  const reviewedDocumentCount = documents.filter((doc) => doc.reviewState != null).length;
  const exportReadyCount = documents.filter((doc) => doc.reviewState === "EXPORT_READY").length;
  const packetReadinessMessage =
    totalDocumentCount === 0
      ? "Add routed documents to this case to enable packet export."
      : reviewedDocumentCount > 0 && exportReadyCount === 0
        ? "Packet export requires at least one document marked export-ready."
        : exportReadyCount > 0
          ? `${exportReadyCount} export-ready document${exportReadyCount === 1 ? "" : "s"} available for packet export.`
          : "Packet export will include the routed documents that match the selected packet type.";

  const isLoading = loading && !caseData;
  const isError = error || !caseData;
  const title = caseData ? (caseData.clientName || caseData.title || caseData.caseNumber || "Case") : "";
  const clioExportLocked = caseData?.clioHandoff?.alreadyExported && !allowClioReexport;
  const hasExtractResult = false;
  const extractResult: {
    providers: { name: string; source: string }[];
    dates: { date: string; label: string; source?: string }[];
    costs: { amount: number; label: string; source?: string }[];
    hasContent: boolean;
  } = { providers: [], dates: [], costs: [], hasContent: false };
  const hasMissingResult = false;
  const missingResult: {
    flags: { category: string; reason: string; confidence?: string; providerName?: string | null; recordsRequestId?: string | null }[];
    hasEvidence: boolean;
    message?: string;
  } = { flags: [], hasEvidence: false, message: undefined };
  const hasCompareResult = false;
  const compareResult: {
    flags: { category: string; reason: string; confidence?: string; providerName?: string | null; documentId?: string | null; dateContext?: string | null }[];
    hasEvidence: boolean;
    message?: string;
  } = { flags: [], hasEvidence: false, message: undefined };
  const hasDraftResult = false;
  const draftResult: { sectionKey: string; title: string; draftText: string; warnings?: string[] } = {
    sectionKey: draftSectionKey,
    title: "",
    draftText: "",
    warnings: [],
  };
  const hasAnswerResult = false;
  const answerResult: { answer: string; sourcesUsed: string[]; warnings?: string[] } = {
    answer: "",
    sourcesUsed: [],
    warnings: [],
  };
  const errorMsgStyle = { margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" } as const;
  const insufficientStyle = { margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" } as const;
  const sourcesLabelStyle = { margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" } as const;

  const renderExtractPanel = (result: NonNullable<typeof extractResult>) => (
    <>
      {!result.hasContent && <p style={insufficientStyle}>Not enough data yet. Build chronology and add documents, then run Extract.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
        <div>
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Providers</p>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{result.providers.length === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : result.providers.map((p, i) => <li key={i}>{p.name}</li>)}</ul>
        </div>
        <div>
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Dates</p>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{result.dates.length === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : result.dates.slice(0, 15).map((d, i) => <li key={i}>{d.date} â€” {d.label}</li>)}</ul>
          {result.dates.length > 15 && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>+{result.dates.length - 15} more</p>}
        </div>
        <div>
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Costs</p>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{result.costs.length === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : result.costs.slice(0, 15).map((c, i) => <li key={i}>${Number(c.amount).toLocaleString()} â€” {c.label}</li>)}</ul>
          {result.costs.length > 15 && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>+{result.costs.length - 15} more</p>}
        </div>
      </div>
    </>
  );

  const renderMissingFlags = (result: NonNullable<typeof missingResult>) => (
    <>
      {!result.hasEvidence && (
        <p style={insufficientStyle}>
          {result.message ?? "Not enough data yet. Add documents and build chronology, then run Identify missing records."}
        </p>
      )}
      {result.hasEvidence && result.flags.length === 0 && (
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          No gaps flagged for this case. Re-run after adding documents if needed.
        </p>
      )}
      {result.hasEvidence && result.flags.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
          {result.flags.map((f, i) => (
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
                    View request â†’
                  </Link>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const renderCompareFlags = (result: NonNullable<typeof compareResult>) => (
    <>
      {!result.hasEvidence && (
        <p style={insufficientStyle}>
          {result.message ?? "Not enough data yet. Build chronology and add documents, then run Compare bills to treatment."}
        </p>
      )}
      {result.hasEvidence && result.flags.length === 0 && (
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          No mismatches flagged. Re-run after adding documents if needed.
        </p>
      )}
      {result.hasEvidence && result.flags.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
          {result.flags.map((f, i) => (
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
  );

  const renderDraftPanel = (result: NonNullable<typeof draftResult>) => (
    <>
      {result.warnings && result.warnings.length > 0 && (
        <p style={insufficientStyle}>
          {result.warnings.join(" ")}
        </p>
      )}
      <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>{result.title}</p>
      <textarea
        readOnly
        value={result.draftText}
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
  );

  const renderAnswerPanel = (result: NonNullable<typeof answerResult>) => (
    <>
      {result.warnings && result.warnings.length > 0 && (
        <p style={insufficientStyle}>
          {result.warnings.join(" ")}
        </p>
      )}
      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{result.answer}</div>
      {result.sourcesUsed.length > 0 && (
        <p style={sourcesLabelStyle}>
          Grounded from: {result.sourcesUsed.join(", ")}
        </p>
      )}
    </>
  );

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
          <ErrorNotice
            message={error ?? "Case not found."}
            action={
              <Link href="/dashboard/cases" style={{ textDecoration: "none" }}>
                <button type="button" className="onyx-btn-secondary">Back to cases</button>
              </Link>
            }
          />
        </div>
      )}
      {!isLoading && !isError && caseData && (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Cases", href: "/dashboard/cases" }, { label: title }]}
        title={title}
        description={caseData.caseNumber ? `Case #${caseData.caseNumber}` : undefined}
      />

      <DashboardCard title="Case workspace tools" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 0.85rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.55 }}>
          Available now: chronology rebuild, chronology export, case-level Clio exports, and packet export. Drafting, Q&A, and other analysis tools stay hidden in this dashboard until their backend seams are confirmed for operator use.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
          {AI_ACTIONS.map((action) => {
            const isChronology = action.id === "chronology";
            const isDisabled = action.comingSoon || (isChronology && chronologyRebuilding);
            const label = isChronology && chronologyRebuilding ? "Rebuilding…" : action.comingSoon ? `${action.label} (coming soon)` : action.label;
            return (
              <button
                key={action.id}
                type="button"
                className={isChronology ? "onyx-btn-primary" : "onyx-btn-secondary"}
                disabled={isDisabled}
                onClick={isChronology ? () => rebuildChronology() : undefined}
                style={{
                  padding: "0.4rem 0.8rem",
                  fontSize: "0.8125rem",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  opacity: isDisabled ? 0.72 : 1,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="button" className="onyx-btn-secondary" onClick={() => setActiveTab("chronology")}>
            Open chronology
          </button>
          <button type="button" className="onyx-btn-secondary" onClick={() => setActiveTab("demands")}>
            Open demand prep
          </button>
          <button type="button" className="onyx-btn-secondary" onClick={() => setActiveTab("documents")}>
            Open exports & documents
          </button>
        </div>
      </DashboardCard>

      {exportMessage ? (
        <ErrorNotice
          tone={exportMessage.includes("started") || exportMessage.includes("ready") ? "success" : "info"}
          title="Workspace update"
          message={exportMessage}
          style={{ marginBottom: "1rem" }}
        />
      ) : null}

      {false && (
      <>
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
              {!summarizeResult!.hasContent && <p style={insufficientStyle}>Not enough data yet. Build chronology and add documents, then run Summarize.</p>}
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.8125rem", margin: 0, padding: 0 }}>{summarizeResult!.body}</pre>
              {summarizeResult!.documentSummaries.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Document summaries</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>
                    {summarizeResult!.documentSummaries.map((doc) => (
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
      {(hasExtractResult || extractError) && (
        <DashboardCard title="Providers, dates & costs" style={{ marginBottom: "1rem" }}>
          {extractError && <p style={errorMsgStyle}>{extractError}</p>}
          {hasExtractResult && !extractError && (
            <>
              {!(extractResult?.hasContent ?? false) && <p style={insufficientStyle}>Not enough data yet. Build chronology and add documents, then run Extract.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
                <div>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Providers</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{(extractResult?.providers.length ?? 0) === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : extractResult?.providers.map((p, i) => <li key={i}>{p.name}</li>)}</ul>
                </div>
                <div>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Dates</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{extractResult!.dates.length === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : extractResult!.dates.slice(0, 15).map((d, i) => <li key={i}>{d.date} — {d.label}</li>)}</ul>
                  {extractResult!.dates.length > 15 && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>+{extractResult!.dates.length - 15} more</p>}
                </div>
                <div>
                  <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>Costs</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem" }}>{extractResult!.costs.length === 0 ? <li style={{ color: "var(--onyx-text-muted)" }}>None</li> : extractResult!.costs.slice(0, 15).map((c, i) => <li key={i}>${Number(c.amount).toLocaleString()} — {c.label}</li>)}</ul>
                  {extractResult!.costs.length > 15 && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>+{extractResult!.costs.length - 15} more</p>}
                </div>
              </div>
            </>
          )}
        </DashboardCard>
      )}

      {(hasMissingResult || missingError) && (
        <DashboardCard title="Missing records" style={{ marginBottom: "1rem" }}>
          {missingError && <p style={errorMsgStyle}>{missingError}</p>}
          {hasMissingResult && !missingError && (
            <>
              {!missingResult!.hasEvidence && (
                <p style={insufficientStyle}>
                  {missingResult!.message ?? "Not enough data yet. Add documents and build chronology, then run Identify missing records."}
                </p>
              )}
              {missingResult!.hasEvidence && missingResult!.flags.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No gaps flagged for this case. Re-run after adding documents if needed.
                </p>
              )}
              {missingResult!.hasEvidence && missingResult!.flags.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                  {missingResult!.flags.map((f, i) => (
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

      {(hasCompareResult || compareError) && (
        <DashboardCard title="Bills vs treatment" style={{ marginBottom: "1rem" }}>
          {compareError && <p style={errorMsgStyle}>{compareError}</p>}
          {hasCompareResult && !compareError && (
            <>
              {!compareResult!.hasEvidence && (
                <p style={insufficientStyle}>
                  {compareResult!.message ?? "Not enough data yet. Build chronology and add documents, then run Compare bills to treatment."}
                </p>
              )}
              {compareResult!.hasEvidence && compareResult!.flags.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No mismatches flagged. Re-run after adding documents if needed.
                </p>
              )}
              {compareResult!.hasEvidence && compareResult!.flags.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                  {compareResult!.flags.map((f, i) => (
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

      {(hasDraftResult || draftError || draftLoading) && (
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
          {hasDraftResult && !draftError && (
            <>
              {draftResult!.warnings?.length ? (
                <p style={insufficientStyle}>
                  {draftResult!.warnings?.join(" ") ?? ""}
                </p>
              ) : null}
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>{draftResult!.title}</p>
              <textarea
                readOnly
                value={draftResult!.draftText}
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
        {hasAnswerResult && !answerError && (
          <>
            {answerResult!.warnings?.length ? (
              <p style={insufficientStyle}>
                {answerResult!.warnings?.join(" ") ?? ""}
              </p>
            ) : null}
            <div style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{answerResult!.answer}</div>
            {answerResult!.sourcesUsed.length > 0 && (
              <p style={sourcesLabelStyle}>
                Grounded from: {answerResult!.sourcesUsed.join(", ")}
              </p>
            )}
          </>
        )}
      </DashboardCard>
      </div>

      </>
      )}

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
        <DashboardCard title="Case insights" style={{ marginTop: "1rem" }}>
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
          {hasCompareResult && (
            <DashboardCard title="Bills vs treatment" style={{ marginBottom: "1rem" }}>
              {!compareResult.hasEvidence && (
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  {compareResult.message ?? "Build chronology and add documents, then run Compare bills to treatment above."}
                </p>
              )}
              {compareResult.hasEvidence && compareResult.flags.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No bill vs treatment mismatches are stored for this case right now.
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
          {!hasCompareResult && (
            <p style={{ margin: "1rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
              Bill-vs-treatment review is not exposed in this workspace yet. Use chronology, bill lines, and routed documents for operator review.
            </p>
          )}
        </>
      )}

      {activeTab === "missing-records" && (
        <DashboardCard title="Missing records">
          {hasMissingResult ? (
            <>
              {!missingResult.hasEvidence && (
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  {missingResult.message ?? "No timeline, providers, or documents for this case. Add documents and build chronology, then run Identify missing records above."}
                </p>
              )}
              {missingResult.hasEvidence && missingResult.flags.length === 0 && (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No likely missing records are stored for this case right now.
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
              Missing-records analysis is not exposed in this workspace yet. Use chronology, documents, and records requests to review coverage gaps.
            </p>
          )}
        </DashboardCard>
      )}

      {activeTab === "demands" && (
        <>
        <DashboardCard title="Chronology for demand drafting" style={{ marginBottom: "1rem" }}>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            Keep chronology work inside the demand flow. Rebuild the case timeline, preview the latest chronology events, and export a staff-ready chronology without leaving this tab.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.9rem" }}>
            <div className="onyx-card" style={{ padding: "0.8rem 0.9rem", minWidth: 150 }}>
              <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Timeline events</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{timelineItems.length}</p>
            </div>
            <div className="onyx-card" style={{ padding: "0.8rem 0.9rem", minWidth: 150 }}>
              <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Providers in chronology</p>
              <p style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{uniqueTimelineProviders.length}</p>
            </div>
            <div className="onyx-card" style={{ padding: "0.8rem 0.9rem", minWidth: 150 }}>
              <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Last timeline event</p>
              <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
                {timelineItems[timelineItems.length - 1]?.date ?? "Not built yet"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              type="button"
              className="onyx-btn-secondary"
              onClick={() => rebuildChronology()}
              disabled={chronologyRebuilding}
            >
              {chronologyRebuilding ? "Rebuilding…" : "Rebuild chronology"}
            </button>
            <button
              type="button"
              className="onyx-btn-primary"
              onClick={() => startChronologyExport("pdf")}
              disabled={chronologyExporting !== null || timelineItems.length === 0}
            >
              {chronologyExporting === "pdf" ? "Preparing PDF…" : "Export chronology PDF"}
            </button>
            <button
              type="button"
              className="onyx-btn-secondary"
              onClick={() => startChronologyExport("docx")}
              disabled={chronologyExporting !== null || timelineItems.length === 0}
            >
              {chronologyExporting === "docx" ? "Preparing DOCX…" : "Export chronology DOCX"}
            </button>
            <button
              type="button"
              className="onyx-link"
              onClick={() => setActiveTab("chronology")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0.35rem 0" }}
            >
              Open full chronology
            </button>
          </div>
          {chronologyPreviewItems.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              No chronology events yet. Rebuild chronology before drafting or exporting demand support materials.
            </p>
          ) : (
            <>
              <Timeline items={chronologyPreviewItems} />
              {timelineItems.length > chronologyPreviewItems.length && (
                <p style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                  Showing the first {chronologyPreviewItems.length} of {timelineItems.length} chronology events.
                </p>
              )}
            </>
          )}
        </DashboardCard>

        <DashboardCard title="Demands">
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
            The authoritative Create Demand flow is still being finalized. This tab keeps chronology and export prep visible, but it does not expose an operator-ready draft generator yet.
          </p>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <ErrorNotice
              tone="info"
              title="Create Demand coming soon"
              message="Use chronology rebuild/export, packet export, and case-level documents while the single authoritative demand-drafting route is being wired into this workspace."
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button
                type="button"
                className="onyx-btn-secondary"
                onClick={() => startChronologyExport("pdf")}
                disabled={chronologyExporting !== null || timelineItems.length === 0}
              >
                {chronologyExporting === "pdf" ? "Preparing PDF…" : "Export chronology PDF"}
              </button>
              <button
                type="button"
                className="onyx-btn-secondary"
                onClick={() => setActiveTab("documents")}
              >
                Open case exports
              </button>
            </div>
          </div>
        </DashboardCard>
        </>
      )}

      {activeTab === "tasks" && (
        <DashboardCard title="Tasks">
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Case tasks and to-dos. Chronology and export prep stay available in this workspace while draft-generation tools are held back until their routes are confirmed.</p>
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
      <DashboardCard title="Case exports" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
          Run case-scoped exports directly from this case workspace for Clio import and packet delivery.
        </p>
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.95rem 1rem",
            borderRadius: "var(--onyx-radius-md)",
            border: "1px solid var(--onyx-border-subtle)",
            background: caseData?.clioHandoff?.alreadyExported
              ? "rgba(34, 197, 94, 0.08)"
              : "rgba(12, 74, 110, 0.04)",
          }}
        >
          <p style={{ margin: "0 0 0.35rem", fontSize: "0.95rem", fontWeight: 600 }}>
            {caseData?.clioHandoff?.alreadyExported ? "Clio handoff already recorded" : "No recorded Clio handoff yet"}
          </p>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--onyx-text-muted)", lineHeight: 1.5 }}>
            {caseData?.clioHandoff?.alreadyExported && caseData.clioHandoff.lastExportedAt
              ? `Last exported ${new Date(caseData.clioHandoff.lastExportedAt).toLocaleString()} via ${caseData.clioHandoff.lastExportSubtype?.replace(/_/g, " ") ?? "export"}${caseData.clioHandoff.lastExportType === "batch" ? " batch" : ""}${caseData.clioHandoff.lastExportWasReExport ? " as a re-export" : ""}${caseData.clioHandoff.lastActorLabel ? ` by ${caseData.clioHandoff.lastActorLabel}` : ""}.`
              : "Use the case-scoped Clio exports below to create the first durable handoff record for this case."}
          </p>
          {caseData?.clioHandoff?.alreadyExported && (
            <div style={{ marginTop: "0.75rem" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  fontSize: "0.875rem",
                  color: "var(--onyx-text)",
                }}
              >
                <input
                  type="checkbox"
                  checked={allowClioReexport}
                  onChange={(event) => setAllowClioReexport(event.target.checked)}
                  disabled={exporting !== null}
                  style={{ accentColor: "var(--onyx-accent)" }}
                />
                Re-export anyway
              </label>
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: allowClioReexport ? "#9a3412" : "var(--onyx-text-muted)" }}>
                {allowClioReexport
                  ? "This case will be exported again and the new handoff will be recorded as a re-export."
                  : "Clio CSV exports stay blocked by default after first handoff to reduce accidental duplicates."}
              </p>
            </div>
          )}
          {caseData?.clioHandoff?.alreadyExported && Array.isArray(caseData.clioHandoffHistory) && caseData.clioHandoffHistory.length > 0 && (
            <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
              {caseData.clioHandoffHistory.slice(0, 3).map((item) => (
                <div
                  key={item.exportId}
                  style={{
                    padding: "0.7rem 0.8rem",
                    borderRadius: "var(--onyx-radius-sm)",
                    background: "var(--onyx-background-surface)",
                    border: "1px solid var(--onyx-border-subtle)",
                  }}
                >
                  <p style={{ margin: "0 0 0.2rem", fontSize: "0.8rem", fontWeight: 600 }}>
                    {item.exportSubtype === "combined_batch" ? "Batch Clio handoff" : `${item.exportSubtype === "contacts" ? "Contacts" : "Matters"} CSV`}{item.isReExport ? " • Re-export" : ""}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>
                    {new Date(item.exportedAt).toLocaleString()}
                    {item.actorLabel ? ` • ${item.actorLabel}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "1rem" }}>
            <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>Contacts CSV</h3>
            <p style={{ margin: "0 0 0.9rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
              Export this case&apos;s client contact row for Clio Manage import.
            </p>
            <button
              type="button"
              onClick={() => startCaseFileExport("contacts")}
              disabled={exporting !== null || clioExportLocked}
              className="onyx-btn-primary"
            >
              {exporting === "contacts" ? "Preparing…" : allowClioReexport ? "Re-export contacts CSV" : "Download contacts CSV"}
            </button>
          </div>

          <div style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "1rem" }}>
            <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>Matters CSV</h3>
            <p style={{ margin: "0 0 0.9rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
              Export this case&apos;s matter row using case number, title, and client details.
            </p>
            <button
              type="button"
              onClick={() => startCaseFileExport("matters")}
              disabled={exporting !== null || clioExportLocked}
              className="onyx-btn-primary"
            >
              {exporting === "matters" ? "Preparing…" : allowClioReexport ? "Re-export matters CSV" : "Download matters CSV"}
            </button>
          </div>

          <div style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "1rem" }}>
            <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>Offers PDF</h3>
            <p style={{ margin: "0 0 0.9rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
              Export a PDF summary of settlement offers recognized on documents routed to this case.
            </p>
            <button
              type="button"
              onClick={() => startCaseFileExport("offers")}
              disabled={exporting !== null}
              className="onyx-btn-primary"
            >
              {exporting === "offers" ? "Preparing…" : "Download offers PDF"}
            </button>
          </div>

          <div style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "1rem" }}>
            <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>Packet export</h3>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
              Build a case packet bundle for download. Timeline is included automatically when available.
            </p>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Packet type</label>
            <select
              value={packetType}
              onChange={(e) => setPacketType(e.target.value as "records" | "bills" | "combined")}
              className="onyx-input"
              style={{ minWidth: 160, marginBottom: "0.75rem" }}
            >
              <option value="combined">Combined (all documents)</option>
              <option value="records">Records packet (medical/legal records only)</option>
              <option value="bills">Bills packet (billing, EOB, ledgers only)</option>
            </select>
            <p style={{ margin: "0 0 0.9rem", fontSize: "0.8125rem", color: packetReadinessMessage.includes("requires") ? "var(--onyx-warning)" : "var(--onyx-text-muted)" }}>
              {packetReadinessMessage}
            </p>
            <button
              type="button"
              onClick={startPacketExport}
              disabled={exporting !== null || totalDocumentCount === 0}
              className="onyx-btn-secondary"
            >
              {exporting === "packet" ? "Preparing…" : "Download packet"}
            </button>
          </div>
        </div>
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
