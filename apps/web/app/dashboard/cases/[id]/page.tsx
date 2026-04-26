"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useDashboardAuth } from "@/contexts/DashboardAuthContext";
import {
  canAccessDashboardFeature,
  type DashboardFeatureKey,
} from "@/lib/dashboardAccess";
import { getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { ErrorNotice } from "@/components/dashboard/ErrorNotice";
import { Timeline, type TimelineItem } from "@/components/dashboard/Timeline";
import { DocumentPreview } from "@/components/dashboard/DocumentPreview";
import { AssistantChatPanel } from "@/components/dashboard/AssistantChatPanel";

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
  documentId?: string | null;
  metadataJson?: { dateUncertain?: boolean } | null;
};

type Provider = {
  id: string;
  providerId: string;
  provider?: { name?: string | null };
  relationship?: string | null;
};

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

type Financial = {
  medicalBillsTotal: number;
  liensTotal: number;
  settlementOffer: number | null;
};

type Insight = {
  type: string;
  severity: string;
  title: string;
  detail: string | null;
};

type BillLine = {
  id: string;
  documentId: string;
  providerName: string | null;
  serviceDate: string | null;
  amountCharged: number | null;
  balance: number | null;
  lineTotal: number | null;
};

type MissingRecordsFlag = {
  title: string;
  summary: string;
  confidence?: "high" | "medium" | "low";
  severity?: "high" | "medium" | "low";
  recommendedAction?: string | null;
  providerName?: string | null;
  recordsRequestId?: string | null;
};

type MissingRecordsAnalysisResult = {
  hasEvidence: boolean;
  message?: string;
  flags: MissingRecordsFlag[];
  recommendedRequests: Array<{
    providerName: string | null;
    rationale?: string;
    reason?: string;
  }>;
};

type BillsVsTreatmentFlag = {
  title: string;
  summary: string;
  confidence?: "high" | "medium" | "low";
  severity?: "high" | "medium" | "low";
  providerName?: string | null;
  documentId?: string | null;
  dateContext?: string | null;
  serviceDate?: string | null;
  treatmentDate?: string | null;
};

type BillsVsTreatmentAnalysisResult = {
  hasEvidence: boolean;
  message?: string;
  flags: BillsVsTreatmentFlag[];
};

type CaseQaSource = {
  kind: string;
  label: string;
  documentId?: string;
};

type CaseQaResponse = {
  generatedAt: string;
  grounded: boolean;
  answer: string;
  warnings: string[];
  sources: CaseQaSource[];
};

type QaHistoryItem = {
  id: string;
  question: string;
  response: CaseQaResponse;
};

type DemandPackageItem = {
  id: string;
  title: string;
  status: string;
  generatedDocId: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DemandPackageReadiness = {
  suggestedTitle: string;
  warnings: string[];
  stats: {
    documentCount: number;
    timelineEventCount: number;
    providerCount: number;
    recordsRequestCount: number;
    hasCaseSummary: boolean;
    hasMedicalBills: boolean;
    hasSettlementOffer: boolean;
  };
};

type TabId =
  | "overview"
  | "documents"
  | "chronology"
  | "medical-bills"
  | "missing-records"
  | "demands"
  | "contacts";

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

function featureAllowed(
  featureKey: DashboardFeatureKey,
  role: string | null | undefined,
  featureFlags: Partial<Record<string, unknown>> | null | undefined
) {
  return canAccessDashboardFeature(featureKey, role, featureFlags);
}

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `$${value.toLocaleString()}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function demandStatusTone(status: string): "neutral" | "warning" | "success" | "error" {
  if (
    status === "released_to_requester" ||
    status === "released" ||
    status === "dev_approved" ||
    status === "pending_dev_review"
  ) {
    return "warning";
  }
  if (status === "failed") return "error";
  return "neutral";
}

function demandStatusLabel(status: string): string {
  if (
    status === "released_to_requester" ||
    status === "released" ||
    status === "dev_approved" ||
    status === "pending_dev_review"
  ) {
    return "Review Required";
  }
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function buildClientSideDemandReadiness(input: {
  caseData: CaseItem | null;
  documents: Doc[];
  timeline: TimelineEvent[];
  providers: Provider[];
  financial: Financial | null;
}): DemandPackageReadiness {
  const warnings: string[] = [];
  if (!input.caseData) {
    warnings.push("Case data is still loading.");
  }
  if (input.documents.length === 0) {
    warnings.push("No routed case documents are available yet.");
  }
  if (input.timeline.length === 0) {
    warnings.push("Chronology has not been built yet, so treatment sequencing may be incomplete.");
  }
  if (input.providers.length === 0) {
    warnings.push("No treating providers are linked to this case.");
  }
  if ((input.financial?.medicalBillsTotal ?? 0) <= 0) {
    warnings.push("Medical specials have not been itemized yet.");
  }

  const caseLabel =
    input.caseData?.clientName?.trim() ||
    input.caseData?.caseNumber?.trim() ||
    input.caseData?.title?.trim() ||
    "Case";

  return {
    suggestedTitle: `${caseLabel} Demand Package`,
    warnings,
    stats: {
      documentCount: input.documents.length,
      timelineEventCount: input.timeline.length,
      providerCount: input.providers.length,
      recordsRequestCount: 0,
      hasCaseSummary: false,
      hasMedicalBills: (input.financial?.medicalBillsTotal ?? 0) > 0,
      hasSettlementOffer:
        typeof input.financial?.settlementOffer === "number" &&
        Number.isFinite(input.financial.settlementOffer),
    },
  };
}

function getAnalysisLevel(
  value: "high" | "medium" | "low" | undefined
): "high" | "medium" | "low" {
  if (value === "high" || value === "medium") return value;
  return "low";
}

function renderAnalysisTone(confidence: "high" | "medium" | "low" | undefined) {
  const normalized = getAnalysisLevel(confidence);
  if (normalized === "high") return "onyx-badge onyx-badge-warning";
  if (normalized === "medium") return "onyx-badge onyx-badge-neutral";
  return "onyx-badge onyx-badge-info";
}

export default function CaseDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { role, featureFlags } = useDashboardAuth();
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
  const [packetType, setPacketType] = useState<"records" | "bills" | "combined">("combined");
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [groupDocsByProvider, setGroupDocsByProvider] = useState(false);
  const [questionInput, setQuestionInput] = useState("");
  const [qaHistory, setQaHistory] = useState<QaHistoryItem[]>([]);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [missingResult, setMissingResult] = useState<MissingRecordsAnalysisResult | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingError, setMissingError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<BillsVsTreatmentAnalysisResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [demandPackages, setDemandPackages] = useState<DemandPackageItem[]>([]);
  const [demandLoading, setDemandLoading] = useState(false);
  const [demandError, setDemandError] = useState<string | null>(null);
  const [demandNotice, setDemandNotice] = useState<string | null>(null);
  const [demandLimitations, setDemandLimitations] = useState<DemandPackageReadiness | null>(null);
  const [creatingDemand, setCreatingDemand] = useState(false);

  const caseQaEnabled = featureAllowed("case_qa_enabled", role, featureFlags);
  const missingRecordsEnabled = featureAllowed("missing_records_enabled", role, featureFlags);
  const billsVsTreatmentEnabled = featureAllowed("bills_vs_treatment_enabled", role, featureFlags);
  const demandDraftsEnabled = featureAllowed("demand_drafts_enabled", role, featureFlags);
  const exportsEnabled = featureAllowed("exports_enabled", role, featureFlags);

  const tabs = useMemo<{ id: TabId; label: string }[]>(() => {
    const items: { id: TabId; label: string }[] = [
      { id: "overview", label: "Overview" },
      { id: "documents", label: "Documents" },
      { id: "chronology", label: "Chronology" },
      { id: "medical-bills", label: "Medical Bills / Specials" },
      { id: "demands", label: "Demands" },
      { id: "contacts", label: "Contacts" },
    ];

    if (missingRecordsEnabled) {
      items.splice(4, 0, { id: "missing-records", label: "Missing Records" });
    }

    return items;
  }, [missingRecordsEnabled]);

  const [activeTab, setActiveTab] = useState<TabId>("overview");

  useEffect(() => {
    const tabFromUrl = searchParams?.get("tab");
    if (tabFromUrl && tabs.some((tab) => tab.id === tabFromUrl)) {
      setActiveTab(tabFromUrl as TabId);
      return;
    }
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, searchParams, tabs]);

  useEffect(() => {
    if (!id) return;
    const headers = { ...getAuthHeader(), Accept: "application/json" };
    Promise.all([
      fetch(caseApiBase, { headers, ...getFetchOptions() }).then(parseJsonResponse),
      fetch(`${caseApiBase}/timeline`, { headers, ...getFetchOptions() }).then(parseJsonResponse),
      fetch(`${caseApiBase}/providers`, { headers, ...getFetchOptions() }).then(parseJsonResponse),
      fetch(`${caseApiBase}/documents?includeProvider=true`, { headers, ...getFetchOptions() }).then(parseJsonResponse),
      fetch(`${caseApiBase}/financial`, { headers, ...getFetchOptions() }).then(parseJsonResponse),
      fetch(`${caseApiBase}/bill-line-items`, { headers, ...getFetchOptions() }).then(parseJsonResponse).catch(() => ({ ok: false })),
      fetch(`${caseApiBase}/insights`, { headers, ...getFetchOptions() }).then(parseJsonResponse).catch(() => ({ ok: false })),
    ])
      .then(([caseRes, timelineRes, providersRes, docsRes, financialRes, billRes, insightsRes]) => {
        const casePayload = caseRes as { ok?: boolean; item?: CaseItem; error?: string };
        const timelinePayload = timelineRes as { ok?: boolean; items?: TimelineEvent[] };
        const providersPayload = providersRes as { ok?: boolean; items?: Provider[] };
        const docsPayload = docsRes as { ok?: boolean; items?: Doc[] };
        const financialPayload = financialRes as { ok?: boolean; item?: Financial };
        const billPayload = billRes as { ok?: boolean; items?: BillLine[] };
        const insightsPayload = insightsRes as { ok?: boolean; insights?: Insight[] };

        if (casePayload.ok && casePayload.item) {
          setCaseData(casePayload.item);
        } else {
          setError(casePayload.error ?? "Case not found.");
        }
        if (timelinePayload.ok && timelinePayload.items) setTimeline(timelinePayload.items);
        if (providersPayload.ok && providersPayload.items) setProviders(providersPayload.items);
        if (docsPayload.ok && docsPayload.items) setDocuments(docsPayload.items);
        if (financialPayload.ok && financialPayload.item) setFinancial(financialPayload.item);
        if (billPayload.ok && billPayload.items) setBillLines(billPayload.items);
        if (insightsPayload.ok && insightsPayload.insights) setInsights(insightsPayload.insights);
      })
      .catch((requestError) => setError((requestError as Error)?.message ?? "Request failed"))
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
        const payload = response as { ok?: boolean; item?: CaseItem };
        if (payload.ok && payload.item) {
          setCaseData(payload.item);
        }
      })
      .catch(() => undefined);
  }, [caseApiBase, id]);

  const rebuildChronology = useCallback(() => {
    if (!id) return;
    setChronologyRebuilding(true);
    fetch(`${caseApiBase}/timeline/rebuild`, {
      method: "POST",
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const payload = response as { ok?: boolean; error?: string };
        if (!payload.ok) {
          setError(payload.error ?? "Failed to rebuild chronology.");
          return;
        }
        return fetch(`${caseApiBase}/timeline`, {
          headers: getAuthHeader(),
          ...getFetchOptions(),
        })
          .then(parseJsonResponse)
          .then((timelineResponse: unknown) => {
            const timelinePayload = timelineResponse as { ok?: boolean; items?: TimelineEvent[] };
            if (timelinePayload.ok && timelinePayload.items) {
              setTimeline(timelinePayload.items);
            }
          });
      })
      .catch((requestError) => setError((requestError as Error)?.message ?? "Request failed"))
      .finally(() => setChronologyRebuilding(false));
  }, [caseApiBase, id]);

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
      } catch (requestError) {
        setExportMessage((requestError as Error)?.message ?? "Request failed");
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
      const payload = (await parseJsonResponse(response)) as {
        error?: string;
        downloadUrl?: string;
        fileName?: string | null;
        documentCount?: number;
      };

      if (!response.ok) {
        setExportMessage(payload.error ?? "Failed to export packet.");
        return;
      }

      if (!payload.downloadUrl) {
        setExportMessage("Packet export completed, but no download URL was returned.");
        return;
      }

      const anchor = document.createElement("a");
      anchor.href = payload.downloadUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      if (payload.fileName) anchor.download = payload.fileName;
      anchor.click();
      const countLabel =
        typeof payload.documentCount === "number" && payload.documentCount > 0
          ? ` for ${payload.documentCount} document${payload.documentCount === 1 ? "" : "s"}`
          : "";
      setExportMessage(`Packet export ready${countLabel}. Download should begin now.`);
    } catch (requestError) {
      setExportMessage((requestError as Error)?.message ?? "Request failed");
    } finally {
      setExporting(null);
    }
  }, [caseApiBase, id, packetType]);

  const startChronologyExport = useCallback(
    async (format: "pdf" | "docx") => {
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
        anchor.download = parseFileName(response.headers.get("content-disposition"), `case-chronology.${format}`);
        anchor.click();
        window.URL.revokeObjectURL(anchor.href);
        setExportMessage(`Chronology ${format.toUpperCase()} download started.`);
      } catch (requestError) {
        setExportMessage((requestError as Error)?.message ?? `Failed to export chronology ${format.toUpperCase()}.`);
      } finally {
        setChronologyExporting(null);
      }
    },
    [caseApiBase, id]
  );

  const loadDemandPackages = useCallback(() => {
    if (!id || !demandDraftsEnabled) return;
    setDemandLoading(true);
    setDemandError(null);
    fetch(`${caseApiBase}/demand-packages`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const payload = response as { ok?: boolean; items?: DemandPackageItem[]; error?: string };
        if (!payload.ok || !Array.isArray(payload.items)) {
          setDemandPackages([]);
          setDemandError(payload.error ?? "Failed to load demand drafts.");
          return;
        }
        setDemandPackages(payload.items);
      })
      .catch((requestError) => setDemandError((requestError as Error)?.message ?? "Request failed"))
      .finally(() => setDemandLoading(false));
  }, [caseApiBase, demandDraftsEnabled, id]);

  const runMissingRecords = useCallback(() => {
    if (!id || !missingRecordsEnabled) return;
    setMissingLoading(true);
    setMissingError(null);
    fetch(`${caseApiBase}/missing-records-analysis`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const payload = response as { ok?: boolean; item?: MissingRecordsAnalysisResult; error?: string };
        if (!payload.ok || !payload.item) {
          setMissingError(payload.error ?? "Failed to analyze missing records.");
          return;
        }
        setMissingResult(payload.item);
      })
      .catch((requestError) => setMissingError((requestError as Error)?.message ?? "Request failed"))
      .finally(() => setMissingLoading(false));
  }, [caseApiBase, id, missingRecordsEnabled]);

  const runCompare = useCallback(() => {
    if (!id || !billsVsTreatmentEnabled) return;
    setCompareLoading(true);
    setCompareError(null);
    fetch(`${caseApiBase}/bills-vs-treatment-analysis`, {
      headers: getAuthHeader(),
      ...getFetchOptions(),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const payload = response as { ok?: boolean; item?: BillsVsTreatmentAnalysisResult; error?: string };
        if (!payload.ok || !payload.item) {
          setCompareError(payload.error ?? "Failed to compare bills versus treatment.");
          return;
        }
        setCompareResult(payload.item);
      })
      .catch((requestError) => setCompareError((requestError as Error)?.message ?? "Request failed"))
      .finally(() => setCompareLoading(false));
  }, [billsVsTreatmentEnabled, caseApiBase, id]);

  const runAnswerQuestion = useCallback(() => {
    if (!id || !caseQaEnabled || !questionInput.trim()) return;
    const question = questionInput.trim();
    setAnswerLoading(true);
    setAnswerError(null);
    fetch(`${caseApiBase}/qa`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      ...getFetchOptions(),
      body: JSON.stringify({ question }),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const payload = response as { ok?: boolean; item?: CaseQaResponse; error?: string };
        if (!payload.ok || !payload.item) {
          setAnswerError(payload.error ?? "Failed to answer the question.");
          return;
        }
        const responseItem = payload.item;
        setQaHistory((current) => [
          ...current,
          {
            id: `${Date.now()}-${current.length}`,
            question,
            response: responseItem,
          },
        ]);
        setQuestionInput("");
      })
      .catch((requestError) => setAnswerError((requestError as Error)?.message ?? "Request failed"))
      .finally(() => setAnswerLoading(false));
  }, [caseApiBase, caseQaEnabled, id, questionInput]);

  const createDemandDraft = useCallback(() => {
    if (!id || !demandDraftsEnabled) return;
    setCreatingDemand(true);
    setDemandError(null);
    setDemandNotice(null);
    fetch(`${caseApiBase}/demand-packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      ...getFetchOptions(),
      body: JSON.stringify({}),
    })
      .then(parseJsonResponse)
      .then((response: unknown) => {
        const payload = response as {
          ok?: boolean;
          item?: DemandPackageItem;
          limitations?: DemandPackageReadiness;
          message?: string;
          error?: string;
        };
        if (!payload.ok || !payload.item) {
          setDemandError(payload.error ?? "Failed to create the demand draft.");
          return;
        }
        setDemandPackages((current) => [payload.item!, ...current.filter((item) => item.id !== payload.item!.id)]);
        setDemandLimitations(payload.limitations ?? null);
        setDemandNotice(payload.message ?? "Demand package queued for generation.");
      })
      .catch((requestError) => setDemandError((requestError as Error)?.message ?? "Request failed"))
      .finally(() => {
        setCreatingDemand(false);
        loadDemandPackages();
      });
  }, [caseApiBase, demandDraftsEnabled, id, loadDemandPackages]);

  useEffect(() => {
    if (activeTab === "missing-records" && missingRecordsEnabled && missingResult == null && !missingLoading) {
      runMissingRecords();
    }
  }, [activeTab, missingLoading, missingRecordsEnabled, missingResult, runMissingRecords]);

  useEffect(() => {
    if (billsVsTreatmentEnabled && compareResult == null && !compareLoading && (activeTab === "medical-bills" || activeTab === "overview")) {
      runCompare();
    }
  }, [activeTab, billsVsTreatmentEnabled, compareLoading, compareResult, runCompare]);

  useEffect(() => {
    if (demandDraftsEnabled && demandPackages.length === 0 && !demandLoading && (activeTab === "demands" || activeTab === "overview")) {
      loadDemandPackages();
    }
  }, [activeTab, demandDraftsEnabled, demandLoading, demandPackages.length, loadDemandPackages]);

  const timelineItems: TimelineItem[] = useMemo(() => {
    let filtered = timeline;
    if (trackFilter && trackFilter !== "all") {
      filtered = filtered.filter((event) => event.track === trackFilter);
    }
    if (providerFilter.trim()) {
      const query = providerFilter.trim().toLowerCase();
      filtered = filtered.filter((event) => event.provider?.toLowerCase().includes(query));
    }
    const withDate = filtered.filter((event) => event.eventDate != null);
    const withoutDate = filtered.filter((event) => event.eventDate == null);
    const sorted = [
      ...withDate.sort((left, right) => new Date(left.eventDate!).getTime() - new Date(right.eventDate!).getTime()),
      ...withoutDate,
    ];
    return sorted.map((event) => ({
      id: event.id,
      date: event.eventDate ? new Date(event.eventDate).toLocaleDateString() : "Date unknown",
      title: event.eventType || "Event",
      description: [event.provider, event.diagnosis, event.procedure].filter(Boolean).join(" | ") || undefined,
      meta: event.amount != null ? `$${Number(event.amount).toLocaleString()}` : undefined,
      dateUncertain:
        event.eventDate == null ||
        Boolean(event.metadataJson && (event.metadataJson as { dateUncertain?: boolean }).dateUncertain),
    }));
  }, [providerFilter, timeline, trackFilter]);

  const chronologyPreviewItems = timelineItems.slice(0, 5);
  const uniqueTimelineProviders = Array.from(new Set(timeline.map((event) => event.provider).filter(Boolean))) as string[];
  const totalDocumentCount = documents.length;
  const reviewedDocumentCount = documents.filter((document) => document.reviewState != null).length;
  const exportReadyCount = documents.filter((document) => document.reviewState === "EXPORT_READY").length;
  const packetReadinessMessage =
    !exportsEnabled
      ? "Case exports are disabled for this firm and role."
      : totalDocumentCount === 0
      ? "Add routed documents to this case to enable packet export."
      : reviewedDocumentCount > 0 && exportReadyCount === 0
        ? "Packet export requires at least one document marked export-ready."
        : exportReadyCount > 0
          ? `${exportReadyCount} export-ready document${exportReadyCount === 1 ? "" : "s"} available for packet export.`
          : "Packet export will include the routed documents that match the selected packet type.";

  const title = caseData?.clientName || caseData?.title || caseData?.caseNumber || "Case";
  const clioExportLocked = Boolean(caseData?.clioHandoff?.alreadyExported && !allowClioReexport);
  const computedDemandReadiness = useMemo(
    () =>
      buildClientSideDemandReadiness({
        caseData,
        documents,
        timeline,
        providers,
        financial,
      }),
    [caseData, documents, financial, providers, timeline]
  );
  const demandReadiness = demandLimitations ?? computedDemandReadiness;

  if (loading && !caseData) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading case...</p>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <ErrorNotice
          message={error ?? "Case not found."}
          action={
            <Link href="/dashboard/cases" className="onyx-btn-secondary" style={{ textDecoration: "none" }}>
              Back to cases
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Cases", href: "/dashboard/cases" },
          { label: title },
        ]}
        title={title}
        description={caseData.caseNumber ? `Case #${caseData.caseNumber}` : "Case workspace"}
      />

      {exportMessage ? (
        <ErrorNotice tone="info" title="Case workflow update" message={exportMessage} style={{ marginBottom: "1rem" }} />
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <DashboardCard title="Documents">
          <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>{documents.length}</p>
          <p style={{ margin: "0.4rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            Routed documents currently attached to this case.
          </p>
        </DashboardCard>
        <DashboardCard title="Chronology">
          <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>{timeline.length}</p>
          <p style={{ margin: "0.4rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            Timeline events available for demand and QA workflows.
          </p>
        </DashboardCard>
        <DashboardCard title="Medical specials">
          <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>{formatMoney(financial?.medicalBillsTotal)}</p>
          <p style={{ margin: "0.4rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            Stored medical bills total for this case.
          </p>
        </DashboardCard>
        <DashboardCard title="Demand drafts">
          <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>{demandPackages.length}</p>
          <p style={{ margin: "0.4rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            Drafts stay review-first and never auto-send from this workspace.
          </p>
        </DashboardCard>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={isActive ? "onyx-btn-primary" : "onyx-btn-secondary"}
              onClick={() => setActiveTab(tab.id)}
              style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem" }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" ? (
        <>
          <DashboardCard title="Case workflow" style={{ marginBottom: "1rem" }}>
            <p style={{ margin: "0 0 0.85rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.55 }}>
              This workspace only shows actions that the current backend can actually fulfill. Chronology, exports, case Q&A, and the case analyses below are live.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
              <button type="button" className="onyx-btn-primary" onClick={() => rebuildChronology()} disabled={chronologyRebuilding}>
                {chronologyRebuilding ? "Rebuilding..." : "Rebuild chronology"}
              </button>
              <button
                type="button"
                className="onyx-btn-secondary"
                onClick={() => startChronologyExport("pdf")}
                disabled={chronologyExporting !== null || timelineItems.length === 0}
              >
                {chronologyExporting === "pdf" ? "Preparing PDF..." : "Export chronology PDF"}
              </button>
              <button
                type="button"
                className="onyx-btn-secondary"
                onClick={() => startChronologyExport("docx")}
                disabled={chronologyExporting !== null || timelineItems.length === 0}
              >
                {chronologyExporting === "docx" ? "Preparing DOCX..." : "Export chronology DOCX"}
              </button>
              {exportsEnabled ? (
                <>
                  <button
                    type="button"
                    className="onyx-btn-secondary"
                    onClick={() => startCaseFileExport("contacts")}
                    disabled={exporting !== null || clioExportLocked}
                  >
                    {exporting === "contacts" ? "Preparing..." : allowClioReexport ? "Re-export contacts CSV" : "Download contacts CSV"}
                  </button>
                  <button
                    type="button"
                    className="onyx-btn-secondary"
                    onClick={() => startCaseFileExport("matters")}
                    disabled={exporting !== null || clioExportLocked}
                  >
                    {exporting === "matters" ? "Preparing..." : allowClioReexport ? "Re-export matters CSV" : "Download matters CSV"}
                  </button>
                  <button
                    type="button"
                    className="onyx-btn-secondary"
                    onClick={() => startCaseFileExport("offers")}
                    disabled={exporting !== null}
                  >
                    {exporting === "offers" ? "Preparing..." : "Download offers PDF"}
                  </button>
                  <button
                    type="button"
                    className="onyx-btn-secondary"
                    onClick={startPacketExport}
                    disabled={exporting !== null || totalDocumentCount === 0}
                  >
                    {exporting === "packet" ? "Preparing..." : "Download packet"}
                  </button>
                </>
              ) : null}
            </div>
            {exportsEnabled && caseData.clioHandoff?.alreadyExported ? (
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem", fontSize: "0.875rem" }}>
                <input
                  type="checkbox"
                  checked={allowClioReexport}
                  onChange={(event) => setAllowClioReexport(event.target.checked)}
                  disabled={exporting !== null}
                  style={{ accentColor: "var(--onyx-accent)" }}
                />
                Re-export Clio CSVs for this case
              </label>
            ) : null}
            {!exportsEnabled ? (
              <p style={{ margin: "0.75rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.8125rem" }}>
                Case exports are hidden until exports are enabled for this firm and your role.
              </p>
            ) : null}
            <p style={{ margin: "0.75rem 0 0", color: "var(--onyx-text-muted)", fontSize: "0.8125rem" }}>
              {packetReadinessMessage}
            </p>
          </DashboardCard>

          <DashboardCard title="Demand readiness" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                Suggested draft title: <strong style={{ color: "var(--onyx-text)" }}>{demandReadiness.suggestedTitle}</strong>
              </p>
              {demandReadiness.warnings.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                  {demandReadiness.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  Core demand inputs are present. Draft output will still be marked needs review.
                </p>
              )}
            </div>
          </DashboardCard>

          <DashboardCard title="Chronology preview" style={{ marginBottom: "1rem" }}>
            {chronologyPreviewItems.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                No chronology events yet. Rebuild chronology after documents finish OCR and routing.
              </p>
            ) : (
              <>
                <Timeline items={chronologyPreviewItems} />
                {timelineItems.length > chronologyPreviewItems.length ? (
                  <p style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                    Showing the first {chronologyPreviewItems.length} of {timelineItems.length} chronology events.
                  </p>
                ) : null}
              </>
            )}
          </DashboardCard>

          <DashboardCard title="Case insights" style={{ marginBottom: "1rem" }}>
            {insights.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                No stored case insights yet. Add documents and chronology to improve grounded analysis.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {insights.slice(0, 4).map((insight) => (
                  <div key={`${insight.type}-${insight.title}`} style={{ borderTop: "1px solid var(--onyx-border-subtle)", paddingTop: "0.65rem" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      <span className="onyx-badge onyx-badge-neutral" style={{ marginRight: "0.35rem" }}>
                        {insight.severity}
                      </span>
                      {insight.title}
                    </p>
                    {insight.detail ? (
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                        {insight.detail}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>

          {caseQaEnabled ? (
            <DashboardCard title="AI assistant chat" style={{ marginBottom: "1rem" }}>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                Ask open questions about this case, Onyx workflow, missing records, bills vs treatment, chronology, or the demand draft. Answers stay firm- and case-scoped.
              </p>
              <AssistantChatPanel
                caseId={id}
                placeholder="Ask about this case, missing records, bills, chronology, or demand draft..."
              />
            </DashboardCard>
          ) : null}

          {caseQaEnabled ? (
            <DashboardCard title="Case Q&A" style={{ marginBottom: "1rem" }}>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                Ask grounded questions about this case. Answers stay limited to routed documents, chronology, providers, bills, and draft demand context.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                <textarea
                  value={questionInput}
                  onChange={(event) => setQuestionInput(event.target.value)}
                  placeholder="Ask about providers, treatment gaps, costs, timeline, or current demand drafts."
                  className="onyx-input"
                  style={{ flex: 1, minWidth: 260, minHeight: 88, resize: "vertical" }}
                  disabled={answerLoading}
                />
                <button
                  type="button"
                  className="onyx-btn-primary"
                  disabled={answerLoading || !questionInput.trim()}
                  onClick={() => runAnswerQuestion()}
                >
                  {answerLoading ? "Answering..." : "Ask"}
                </button>
              </div>
              {answerError ? <ErrorNotice message={answerError} style={{ marginBottom: "0.75rem" }} /> : null}
              {qaHistory.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No Q&A yet. Ask a case-specific question to see a grounded answer with cited sources.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {qaHistory.map((entry) => (
                    <div key={entry.id} style={{ borderTop: "1px solid var(--onyx-border-subtle)", paddingTop: "0.75rem" }}>
                      <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 700, color: "var(--onyx-accent)" }}>Question</p>
                      <p style={{ margin: "0.25rem 0 0.5rem", fontSize: "0.9rem" }}>{entry.question}</p>
                      <p style={{ margin: 0, fontSize: "0.8125rem", fontWeight: 700, color: "var(--onyx-accent)" }}>Answer</p>
                      <div style={{ marginTop: "0.25rem", whiteSpace: "pre-wrap", fontSize: "0.9rem", lineHeight: 1.6 }}>
                        {entry.response.answer}
                      </div>
                      {entry.response.warnings.length > 0 ? (
                        <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                          {entry.response.warnings.join(" ")}
                        </p>
                      ) : null}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
                        {entry.response.sources.map((source, index) =>
                          source.documentId ? (
                            <Link
                              key={`${entry.id}-${source.documentId}-${index}`}
                              href={`/dashboard/documents/${source.documentId}`}
                              className="onyx-badge onyx-badge-neutral"
                              style={{ textDecoration: "none" }}
                            >
                              {source.label}
                            </Link>
                          ) : (
                            <span key={`${entry.id}-${source.label}-${index}`} className="onyx-badge onyx-badge-neutral">
                              {source.label}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          ) : (
            <ErrorNotice
              tone="info"
              title="Case Q&A unavailable"
              message="Case Q&A is hidden for this firm until case_qa_enabled is turned on."
              style={{ marginBottom: "1rem" }}
            />
          )}

          {missingRecordsEnabled ? (
            <DashboardCard title="Missing records snapshot">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <button type="button" className="onyx-btn-secondary" onClick={() => runMissingRecords()} disabled={missingLoading}>
                  {missingLoading ? "Analyzing..." : "Refresh missing-records analysis"}
                </button>
                {billsVsTreatmentEnabled ? (
                  <button type="button" className="onyx-btn-secondary" onClick={() => runCompare()} disabled={compareLoading}>
                    {compareLoading ? "Comparing..." : "Refresh bills vs treatment"}
                  </button>
                ) : null}
              </div>
              {missingError ? <ErrorNotice message={missingError} style={{ marginBottom: "0.75rem" }} /> : null}
              {missingResult == null ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  Run the analysis to identify treatment gaps, providers with no records, and suggested records requests.
                </p>
              ) : !missingResult.hasEvidence ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  {missingResult.message ?? "Not enough case evidence is stored yet to identify gaps."}
                </p>
              ) : missingResult.flags.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No likely record gaps are flagged right now.
                </p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                  {missingResult.flags.slice(0, 4).map((flag) => (
                    <li key={`${flag.title}-${flag.summary}`} style={{ marginBottom: "0.5rem" }}>
                      <span className={renderAnalysisTone(flag.severity ?? flag.confidence)} style={{ marginRight: "0.35rem" }}>
                        {getAnalysisLevel(flag.severity ?? flag.confidence)}
                      </span>
                      <strong>{flag.title}:</strong> {flag.summary}
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>
          ) : null}
        </>
      ) : null}

      {activeTab === "documents" ? (
        <>
          {exportsEnabled ? (
            <DashboardCard title="Case exports" style={{ marginBottom: "1rem" }}>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                Run case-scoped exports directly from this workspace for Clio import, offers review, and packet delivery.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
                <div style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "1rem" }}>
                  <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>Contacts CSV</h3>
                  <p style={{ margin: "0 0 0.9rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
                    Export this case's client contact row for Clio Manage import.
                  </p>
                  <button
                    type="button"
                    onClick={() => startCaseFileExport("contacts")}
                    disabled={exporting !== null || clioExportLocked}
                    className="onyx-btn-primary"
                  >
                    {exporting === "contacts" ? "Preparing..." : allowClioReexport ? "Re-export contacts CSV" : "Download contacts CSV"}
                  </button>
                </div>

                <div style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "1rem" }}>
                  <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>Matters CSV</h3>
                  <p style={{ margin: "0 0 0.9rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
                    Export this case's matter row using case number, title, and client details.
                  </p>
                  <button
                    type="button"
                    onClick={() => startCaseFileExport("matters")}
                    disabled={exporting !== null || clioExportLocked}
                    className="onyx-btn-primary"
                  >
                    {exporting === "matters" ? "Preparing..." : allowClioReexport ? "Re-export matters CSV" : "Download matters CSV"}
                  </button>
                </div>

                <div style={{ border: "1px solid var(--onyx-border-subtle)", borderRadius: "var(--onyx-radius-md)", padding: "1rem" }}>
                  <h3 style={{ margin: "0 0 0.35rem", fontSize: "1rem", fontWeight: 600 }}>Offers PDF</h3>
                  <p style={{ margin: "0 0 0.9rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)", lineHeight: 1.45 }}>
                    Export a PDF summary of settlement offers recognized on documents routed to this case.
                  </p>
                  <button type="button" onClick={() => startCaseFileExport("offers")} disabled={exporting !== null} className="onyx-btn-primary">
                    {exporting === "offers" ? "Preparing..." : "Download offers PDF"}
                  </button>
                </div>
              </div>
            </DashboardCard>
          ) : (
            <ErrorNotice
              tone="info"
              title="Case exports unavailable"
              message="Case exports are hidden until exports_enabled is turned on for this firm and role."
              style={{ marginBottom: "1rem" }}
            />
          )}

          <DashboardCard title="Documents">
            {documents.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No documents yet.</p>
            ) : (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.8125rem" }}>
                  <input
                    type="checkbox"
                    checked={groupDocsByProvider}
                    onChange={(event) => setGroupDocsByProvider(event.target.checked)}
                  />
                  Group by provider
                </label>
                {groupDocsByProvider ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {Array.from(new Set(documents.map((document) => document.providerName?.trim() || "No provider")))
                      .sort((left, right) => left.localeCompare(right))
                      .map((providerName) => {
                        const providerDocuments = documents.filter(
                          (document) => (document.providerName?.trim() || "No provider") === providerName
                        );
                        return (
                          <div key={providerName}>
                            <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--onyx-text-muted)" }}>
                              {providerName}
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                              {providerDocuments.map((document) => (
                                <DocumentPreview
                                  key={document.id}
                                  id={document.id}
                                  name={document.originalName}
                                  status={document.status}
                                  pageCount={document.pageCount ?? undefined}
                                  showPreview={true}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {documents.map((document) => (
                      <DocumentPreview
                        key={document.id}
                        id={document.id}
                        name={document.originalName}
                        status={document.status}
                        pageCount={document.pageCount ?? undefined}
                        showPreview={true}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </DashboardCard>
        </>
      ) : null}

      {activeTab === "chronology" ? (
        <DashboardCard title="Chronology">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.85rem" }}>
            <select
              value={trackFilter}
              onChange={(event) => setTrackFilter(event.target.value)}
              className="onyx-input"
              style={{ minWidth: 180 }}
            >
              <option value="all">All tracks</option>
              {Array.from(new Set(timeline.map((event) => event.track).filter(Boolean))).map((track) => (
                <option key={track} value={track ?? ""}>
                  {track}
                </option>
              ))}
            </select>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="onyx-input"
              style={{ minWidth: 220 }}
            >
              <option value="">All providers</option>
              {uniqueTimelineProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
          {timelineItems.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              No chronology events yet. Rebuild chronology after documents finish OCR and routing.
            </p>
          ) : (
            <Timeline items={timelineItems} />
          )}
        </DashboardCard>
      ) : null}

      {activeTab === "medical-bills" ? (
        <>
          <DashboardCard title="Medical bills / specials" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
              <div>
                <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--onyx-text-muted)" }}>
                  Medical bills
                </p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "1.3rem", fontWeight: 700 }}>{formatMoney(financial?.medicalBillsTotal)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--onyx-text-muted)" }}>
                  Liens
                </p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "1.3rem", fontWeight: 700 }}>{formatMoney(financial?.liensTotal)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--onyx-text-muted)" }}>
                  Settlement offer
                </p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "1.3rem", fontWeight: 700 }}>{formatMoney(financial?.settlementOffer)}</p>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard title="Bill lines" style={{ marginBottom: "1rem" }}>
            {billLines.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                No bill lines are stored for this case yet.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.6rem" }}>
                {billLines.map((line) => (
                  <div key={line.id} style={{ borderBottom: "1px solid var(--onyx-border-subtle)", paddingBottom: "0.6rem" }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>{line.providerName || "Unknown provider"}</p>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                      Service date: {formatDate(line.serviceDate)} | Charged: {formatMoney(line.amountCharged)} | Balance: {formatMoney(line.balance)} | Line total: {formatMoney(line.lineTotal)}
                    </p>
                    <Link href={`/dashboard/documents/${line.documentId}`} className="onyx-link" style={{ fontSize: "0.8125rem" }}>
                      Open source document
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>

          {billsVsTreatmentEnabled ? (
            <DashboardCard title="Bills vs treatment analysis">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <button type="button" className="onyx-btn-primary" onClick={() => runCompare()} disabled={compareLoading}>
                  {compareLoading ? "Comparing..." : "Refresh analysis"}
                </button>
              </div>
              {compareError ? <ErrorNotice message={compareError} style={{ marginBottom: "0.75rem" }} /> : null}
              {compareResult == null ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  Run the analysis to compare stored bill lines against chronology and treatment evidence.
                </p>
              ) : !compareResult.hasEvidence ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  {compareResult.message ?? "Not enough billing or treatment evidence is stored yet."}
                </p>
              ) : compareResult.flags.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No obvious mismatches between treatment and billing are flagged right now.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  {compareResult.flags.map((flag) => (
                    <div key={`${flag.title}-${flag.summary}`} style={{ borderTop: "1px solid var(--onyx-border-subtle)", paddingTop: "0.65rem" }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>
                        <span className={renderAnalysisTone(flag.severity ?? flag.confidence)} style={{ marginRight: "0.35rem" }}>
                          {getAnalysisLevel(flag.severity ?? flag.confidence)}
                        </span>
                        {flag.title}
                      </p>
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                        {flag.summary}
                      </p>
                      {flag.providerName || flag.dateContext || flag.serviceDate || flag.treatmentDate ? (
                        <p style={{ margin: "0.3rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                          {[
                            flag.providerName,
                            flag.dateContext,
                            flag.serviceDate ? `Service ${formatDate(flag.serviceDate)}` : null,
                            flag.treatmentDate ? `Treatment ${formatDate(flag.treatmentDate)}` : null,
                          ].filter(Boolean).join(" | ")}
                        </p>
                      ) : null}
                      {flag.documentId ? (
                        <Link href={`/dashboard/documents/${flag.documentId}`} className="onyx-link" style={{ fontSize: "0.8125rem" }}>
                          Open source document
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          ) : (
            <ErrorNotice
              tone="info"
              title="Bills vs treatment unavailable"
              message="This analysis is hidden until bills_vs_treatment_enabled is turned on for the firm."
            />
          )}
        </>
      ) : null}

      {activeTab === "missing-records" ? (
        <DashboardCard title="Missing records analysis">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <button type="button" className="onyx-btn-primary" onClick={() => runMissingRecords()} disabled={missingLoading}>
              {missingLoading ? "Analyzing..." : "Refresh analysis"}
            </button>
          </div>
          {missingError ? <ErrorNotice message={missingError} style={{ marginBottom: "0.75rem" }} /> : null}
          {missingResult == null ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              Run the analysis to compare treatment chronology and providers against the records currently on file.
            </p>
          ) : !missingResult.hasEvidence ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              {missingResult.message ?? "No timeline, providers, or documents are stored yet for this case."}
            </p>
          ) : (
            <>
              {missingResult.flags.length === 0 ? (
                <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No likely missing-record gaps are flagged right now.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.65rem", marginBottom: "0.85rem" }}>
                  {missingResult.flags.map((flag) => (
                    <div key={`${flag.title}-${flag.summary}`} style={{ borderTop: "1px solid var(--onyx-border-subtle)", paddingTop: "0.65rem" }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>
                        <span className={renderAnalysisTone(flag.severity ?? flag.confidence)} style={{ marginRight: "0.35rem" }}>
                          {getAnalysisLevel(flag.severity ?? flag.confidence)}
                        </span>
                        {flag.title}
                      </p>
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                        {flag.summary}
                      </p>
                      {flag.recommendedAction ? (
                        <p style={{ margin: "0.3rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                          Recommended action: {flag.recommendedAction}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {missingResult.recommendedRequests.length > 0 ? (
                <div>
                  <p style={{ margin: "0 0 0.45rem", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--onyx-text-muted)" }}>
                    Recommended records requests
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                    {missingResult.recommendedRequests.map((request) => (
                      <li key={`${request.providerName}-${request.reason ?? request.rationale}`}>
                        {(request.providerName || "Provider to confirm")}: {request.reason ?? request.rationale}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </DashboardCard>
      ) : null}

      {activeTab === "demands" ? (
        <DashboardCard title="Demand drafts">
          {demandDraftsEnabled ? (
            <>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                Demand drafts are generated from this case's stored records, bills, chronology, providers, and summaries. Every draft stays in a review-required state.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
                <button type="button" className="onyx-btn-primary" onClick={() => createDemandDraft()} disabled={creatingDemand}>
                  {creatingDemand ? "Creating..." : "Create demand draft"}
                </button>
                <button type="button" className="onyx-btn-secondary" onClick={() => loadDemandPackages()} disabled={demandLoading}>
                  {demandLoading ? "Refreshing..." : "Refresh drafts"}
                </button>
              </div>
              {demandNotice ? <ErrorNotice tone="success" title="Demand workflow update" message={demandNotice} style={{ marginBottom: "0.75rem" }} /> : null}
              {demandError ? <ErrorNotice message={demandError} style={{ marginBottom: "0.75rem" }} /> : null}

              <div style={{ marginBottom: "0.85rem" }}>
                <p style={{ margin: "0 0 0.45rem", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--onyx-text-muted)" }}>
                  Current limitations
                </p>
                {demandReadiness.warnings.length === 0 ? (
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                    Core draft inputs are present. The resulting package still needs human review before any release.
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                    {demandReadiness.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>

              {demandLoading && demandPackages.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>Loading draft history...</p>
              ) : demandPackages.length === 0 ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                  No demand drafts exist for this case yet.
                </p>
              ) : (
                <div style={{ display: "grid", gap: "0.65rem" }}>
                  {demandPackages.map((demandPackage) => (
                    <div key={demandPackage.id} style={{ borderTop: "1px solid var(--onyx-border-subtle)", paddingTop: "0.65rem" }}>
                      <p style={{ margin: 0, fontWeight: 600 }}>
                        <span className={`onyx-badge onyx-badge-${demandStatusTone(demandPackage.status)}`} style={{ marginRight: "0.35rem" }}>
                          {demandStatusLabel(demandPackage.status)}
                        </span>
                        {demandPackage.title}
                      </p>
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                        Created {formatDateTime(demandPackage.createdAt)} | Updated {formatDateTime(demandPackage.updatedAt)}
                        {demandPackage.generatedAt ? ` | Generated ${formatDateTime(demandPackage.generatedAt)}` : ""}
                      </p>
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
                        Status remains review-first. Drafts are never auto-sent from this workflow.
                      </p>
                      {demandPackage.generatedDocId ? (
                        <Link href={`/dashboard/documents/${demandPackage.generatedDocId}`} className="onyx-link" style={{ fontSize: "0.8125rem" }}>
                          Open generated draft document
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <ErrorNotice
              tone="info"
              title="Demand drafts unavailable"
              message="Demand draft generation is hidden until demand_drafts_enabled is turned on for the firm."
            />
          )}
        </DashboardCard>
      ) : null}

      {activeTab === "contacts" ? (
        <DashboardCard title="Contacts">
          {providers.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No providers linked.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
              {providers.map((provider) => (
                <li key={provider.id} style={{ marginBottom: "0.35rem" }}>
                  <Link href={`/dashboard/providers/${provider.providerId}`} className="onyx-link">
                    {provider.provider?.name ?? provider.providerId}
                  </Link>
                  {provider.relationship ? ` | ${provider.relationship}` : ""}
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
      ) : null}
    </div>
  );
}
