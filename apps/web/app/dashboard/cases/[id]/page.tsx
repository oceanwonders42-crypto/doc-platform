"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
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
    const tabFromUrl = searchParams?.get("tab");
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

  const runSummarize = useCallback(() => {
    if (!id) return;
    setSummarizeError(null);
    setSummarizeResult(null);
    setSummarizeLoading(true);
    fetch(`${caseApiBase}/summarize`, {
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
  }, [caseApiBase, id]);

  const runExtract = useCallback(() => {
    if (!id) return;
    setExtractError(null);
    setExtractResult(null);
    setExtractLoading(true);
    fetch(`${caseApiBase}/extract-entities`, {
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
  }, [caseApiBase, id]);

  const runMissingRecords = useCallback(() => {
    if (!id) return;
    setMissingError(null);
    setMissingResult(null);
    setMissingLoading(true);
    fetch(`${caseApiBase}/identify-missing-records`, {
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
  }, [caseApiBase, id]);

  const runCompare = useCallback(() => {
    if (!id) return;
    setCompareError(null);
    setCompareResult(null);
    setCompareLoading(true);
    fetch(`${caseApiBase}/compare-bills-treatment`, {
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
  }, [caseApiBase, id]);

  const runDraft = useCallback(
    (sectionKey?: string) => {
      if (!id) return;
      const key = sectionKey ?? draftSectionKey;
      setDraftError(null);
      setDraftResult(null);
      setDraftLoading(true);
      fetch(`${caseApiBase}/draft-demand-section`, {
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
    [caseApiBase, id, draftSectionKey]
  );

  const runAnswerQuestion = useCallback(() => {
    if (!id) return;
    const q = questionInput.trim();
    if (!q) return;
    setAnswerError(null);
    setAnswerResult(null);
    setAnswerLoading(true);
    fetch(`${caseApiBase}/answer-question`, {
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
  }, [caseApiBase, id, questionInput]);

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
        </>
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
        {exportMessage && (
          <p
            style={{
              margin: 0,
              fontSize: "0.8125rem",
              color:
                exportMessage.includes("started") || exportMessage.includes("ready")
                  ? "var(--onyx-success)"
                  : "var(--onyx-text-muted)",
            }}
          >
            {exportMessage}
          </p>
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
