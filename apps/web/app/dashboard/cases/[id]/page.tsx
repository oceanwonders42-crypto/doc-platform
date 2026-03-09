"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  const [packetType, setPacketType] = useState<"records" | "bills" | "combined">("combined");
  const [trackFilter, setTrackFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("");
  const [groupDocsByProvider, setGroupDocsByProvider] = useState(false);

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

  if (loading && !caseData) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <PageHeader breadcrumbs={[{ label: "Cases", href: "/dashboard/cases" }, { label: "…" }]} title="Case" description="Loading…" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <PageHeader breadcrumbs={[{ label: "Cases", href: "/dashboard/cases" }]} title="Case" />
        <div className="onyx-card" style={{ padding: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error ?? "Case not found."}</p>
          <Link href="/dashboard/cases" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem" }}>Back to cases</Link>
        </div>
      </div>
    );
  }

  const title = caseData.clientName || caseData.title || caseData.caseNumber || "Case";

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Cases", href: "/dashboard/cases" }, { label: title }]}
        title={title}
        description={caseData.caseNumber ? `Case #${caseData.caseNumber}` : undefined}
      />

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
        <DashboardCard title="Treatment timeline">
          <div style={{ marginBottom: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600 }}>Track:</label>
            <select
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 120, fontSize: "0.8125rem" }}
            >
              <option value="all">All</option>
              <option value="medical">Medical</option>
              <option value="legal">Legal</option>
              <option value="insurance">Insurance</option>
            </select>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, marginLeft: "0.5rem" }}>Provider:</label>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="onyx-input"
              style={{ minWidth: 140, fontSize: "0.8125rem" }}
            >
              <option value="">All providers</option>
              {uniqueTimelineProviders.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          {timelineItems.length === 0 ? (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No timeline events yet.{trackFilter !== "all" || providerFilter ? " Try changing filters." : ""}</p>
          ) : (
            <Timeline items={timelineItems} />
          )}
        </DashboardCard>
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

      <DashboardCard title="Export" style={{ marginTop: "1rem" }}>
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
    </div>
  );
}
