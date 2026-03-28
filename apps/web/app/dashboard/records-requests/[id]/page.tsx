"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DataTable, Column } from "@/components/dashboard/DataTable";

type Attachment = { id: string; kind: string; documentId: string; createdAt: string };
type Event = { id: string; eventType: string; status: string | null; message: string | null; createdAt: string };
type CaseInfo = { id: string; title?: string | null; caseNumber?: string | null; clientName?: string | null };
type RecordsRequestAttempt = {
  id: string;
  channel: string;
  destination: string;
  ok: boolean;
  error?: string | null;
  externalId?: string | null;
  createdAt: string;
};
type RequestDetail = {
  id: string;
  firmId: string;
  caseId: string;
  providerId: string | null;
  providerName: string;
  providerContact: string | null;
  status: string;
  statusLabel?: string;
  requestType: string | null;
  destinationType: string | null;
  destinationValue: string | null;
  subject: string | null;
  messageBody: string | null;
  notes?: string | null;
  letterBody?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  requestedDateFrom: string | null;
  requestedDateTo: string | null;
  requestDate?: string | null;
  responseDate?: string | null;
  sentAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  followUpCount: number | null;
  lastFollowUpAt: string | null;
  generatedDocumentId?: string | null;
  createdAt: string;
  updatedAt?: string;
  attachments: Attachment[];
  events: Event[];
};

type RequestResponse = {
  ok?: boolean;
  request?: RequestDetail;
  item?: RequestDetail;
  case?: CaseInfo;
  error?: string;
};

type LetterResponse = {
  ok?: boolean;
  text?: string;
  request?: RequestDetail;
  error?: string;
};

type AttemptsResponse = {
  ok?: boolean;
  items?: RecordsRequestAttempt[];
  error?: string;
};

function statusBadgeClass(status: string): string {
  if (status === "COMPLETED") return "onyx-badge onyx-badge-success";
  if (status === "FAILED") return "onyx-badge onyx-badge-error";
  if (status === "SENT" || status === "RECEIVED") return "onyx-badge onyx-badge-info";
  if (status === "FOLLOW_UP_DUE") return "onyx-badge onyx-badge-warning";
  return "onyx-badge onyx-badge-neutral";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function defaultSendChannel(request: RequestDetail | null): "email" | "fax" {
  return request?.destinationType === "FAX" ? "fax" : "email";
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

export default function RecordsRequestDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [attempts, setAttempts] = useState<RecordsRequestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [providerName, setProviderName] = useState("");
  const [providerContact, setProviderContact] = useState("");
  const [subject, setSubject] = useState("");
  const [requestedDateFrom, setRequestedDateFrom] = useState("");
  const [requestedDateTo, setRequestedDateTo] = useState("");
  const [notes, setNotes] = useState("");
  const [letterBody, setLetterBody] = useState("");

  const [saveLoading, setSaveLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<"email" | "fax">("email");
  const [sendTo, setSendTo] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [action, setAction] = useState<"follow-up" | "complete" | "receive" | "failed" | null>(null);
  const [attachDocId, setAttachDocId] = useState("");
  const [attachKind, setAttachKind] = useState<string>("RESPONSE_DOC");
  const [attachLoading, setAttachLoading] = useState(false);

  function hydrate(detail: RequestDetail, relatedCase?: CaseInfo | null, letterText?: string, nextAttempts?: RecordsRequestAttempt[]) {
    setRequest(detail);
    setCaseInfo(relatedCase ?? null);
    if (nextAttempts) setAttempts(nextAttempts);
    setProviderName(detail.providerName ?? "");
    setProviderContact(detail.providerContact ?? "");
    setSubject(detail.subject ?? "");
    setRequestedDateFrom(toDateInputValue(detail.requestedDateFrom ?? detail.dateFrom));
    setRequestedDateTo(toDateInputValue(detail.requestedDateTo ?? detail.dateTo));
    setNotes(detail.notes ?? "");
    setLetterBody(letterText ?? detail.letterBody ?? detail.messageBody ?? "");
    setSendChannel(defaultSendChannel(detail));
    setSendTo(detail.destinationValue ?? "");
  }

  async function loadData(showSpinner = false) {
    if (!id) return;
    if (showSpinner) setLoading(true);
    setError(null);

    try {
      const base = getApiBase();
      const headers = getAuthHeader();

      const [requestRes, attemptsRes, letterRes] = await Promise.all([
        fetch(`${base}/records-requests/${encodeURIComponent(id)}`, { headers, ...getFetchOptions() }),
        fetch(`${base}/records-requests/${encodeURIComponent(id)}/attempts`, { headers, ...getFetchOptions() }),
        fetch(`${base}/records-requests/${encodeURIComponent(id)}/letter`, { headers, ...getFetchOptions() }),
      ]);

      const requestData = (await parseJsonResponse(requestRes)) as RequestResponse;
      if (!requestRes.ok || !requestData.ok || !(requestData.request ?? requestData.item)) {
        throw new Error(requestData.error ?? `Failed to load request (${requestRes.status})`);
      }

      const attemptsData = attemptsRes.ok
        ? ((await parseJsonResponse(attemptsRes)) as AttemptsResponse)
        : { items: [] };
      const letterData = letterRes.ok
        ? ((await parseJsonResponse(letterRes)) as LetterResponse)
        : { text: requestData.request?.letterBody ?? requestData.item?.letterBody ?? "" };

      const detail = (requestData.request ?? requestData.item)!;
      hydrate(
        detail,
        requestData.case ?? null,
        letterData.text ?? detail.letterBody ?? detail.messageBody ?? "",
        Array.isArray(attemptsData.items) ? attemptsData.items : []
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    void loadData(true);
  }, [id]);

  async function handleSave() {
    if (!id || !request) return;
    setSaveLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({
          providerName: providerName.trim(),
          providerContact: providerContact.trim() || null,
          subject: subject.trim() || null,
          requestedDateFrom: requestedDateFrom || null,
          requestedDateTo: requestedDateTo || null,
          notes: notes.trim() || null,
          letterBody,
        }),
      });
      const data = (await parseJsonResponse(res)) as RequestResponse;
      if (!res.ok || !data.ok || !(data.request ?? data.item)) {
        setError(data.error ?? `Failed to save (${res.status})`);
        return;
      }
      const detail = (data.request ?? data.item)!;
      hydrate(detail, data.case ?? caseInfo, letterBody, attempts);
      setSuccess("Request details updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleGeneratePdf() {
    if (!id) return;
    setGenerateLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}/generate-pdf`, {
        method: "POST",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; documentId?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Failed to generate PDF (${res.status})`);
        return;
      }
      await loadData();
      setSuccess("PDF generated and attached to the request.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setGenerateLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!id) return;
    setDownloadLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}/letter?format=pdf`, {
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, `Failed to download PDF (${res.status})`));
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `records-request-${id}.pdf`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setSuccess("PDF downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!id) return;
    if (!sendTo.trim()) {
      setError(sendChannel === "email" ? "Enter an email address before sending." : "Enter a fax number before sending.");
      return;
    }

    setSendLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ channel: sendChannel, to: sendTo.trim() }),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Send failed (${res.status})`);
        return;
      }
      setSendOpen(false);
      await loadData();
      setSuccess(data.message ?? "Records request sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSendLoading(false);
    }
  }

  async function sendFollowUp() {
    if (!id) return;
    setAction("follow-up");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({}),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Follow-up failed (${res.status})`);
        return;
      }
      await loadData();
      setSuccess("Follow-up sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAction(null);
    }
  }

  async function markComplete() {
    if (!id) return;
    setAction("complete");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}/complete`, {
        method: "POST",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Update failed (${res.status})`);
        return;
      }
      await loadData();
      setSuccess("Marked as completed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAction(null);
    }
  }

  async function markReceived() {
    if (!id) return;
    setAction("receive");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({}),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Update failed (${res.status})`);
        return;
      }
      await loadData();
      setSuccess("Marked as received.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAction(null);
    }
  }

  async function markFailed() {
    if (!id) return;
    setAction("failed");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}/mark-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ message: "Marked as failed from dashboard" }),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Update failed (${res.status})`);
        return;
      }
      await loadData();
      setSuccess("Marked as failed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAction(null);
    }
  }

  async function attachDocument() {
    if (!id || !attachDocId.trim()) return;
    setAttachLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${encodeURIComponent(id)}/attach-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        ...getFetchOptions(),
        body: JSON.stringify({ documentId: attachDocId.trim(), kind: attachKind }),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Attach failed (${res.status})`);
        return;
      }
      setAttachDocId("");
      await loadData();
      setSuccess("Document attached.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAttachLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader
          breadcrumbs={[{ label: "Records requests", href: "/dashboard/records-requests" }, { label: "…" }]}
          title="Records request"
          description="Loading…"
        />
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading records request…</p>
        </div>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Records requests", href: "/dashboard/records-requests" }]} title="Records request" />
        <div className="onyx-card" style={{ padding: "1.25rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
          <Link href="/dashboard/records-requests" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem" }}>
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  if (!request) return null;

  const caseLabel = caseInfo?.caseNumber || caseInfo?.clientName || caseInfo?.title || request.caseId.slice(0, 8);
  const canFollowUp = (request.status === "SENT" || request.status === "FOLLOW_UP_DUE") && !!request.destinationValue;
  const canComplete = request.status !== "CANCELLED" && request.status !== "COMPLETED";
  const canReceive = ["SENT", "FOLLOW_UP_DUE", "DRAFT"].includes(request.status);
  const canMarkFailed = ["DRAFT", "SENT", "FOLLOW_UP_DUE"].includes(request.status);
  const canSend = !["RECEIVED", "COMPLETED", "CANCELLED"].includes(request.status);

  const attemptColumns: Column<RecordsRequestAttempt>[] = [
    { key: "createdAt", header: "Date", render: (row) => formatDateTime(row.createdAt) },
    { key: "channel", header: "Channel", render: (row) => row.channel.toUpperCase() },
    { key: "destination", header: "Destination", render: (row) => row.destination || "—" },
    {
      key: "status",
      header: "Result",
      render: (row) =>
        row.ok ? (
          <span className="onyx-badge onyx-badge-success">Delivered</span>
        ) : (
          <span className="onyx-badge onyx-badge-error">Failed</span>
        ),
    },
    {
      key: "detail",
      header: "Detail",
      render: (row) => row.error ?? row.externalId ?? "—",
    },
  ];

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Records requests", href: "/dashboard/records-requests" }, { label: request.providerName }]}
        title={request.providerName}
        description={`${request.requestType ?? "Records request"} · ${caseLabel}`}
        action={
          <span className={statusBadgeClass(request.status)} style={{ textTransform: "uppercase", fontSize: "0.75rem" }}>
            {request.statusLabel ?? request.status.replace(/_/g, " ")}
          </span>
        }
      />

      {(error || success) && (
        <div
          className="onyx-card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
            borderColor: error ? "var(--onyx-error)" : "var(--onyx-success)",
            background: error ? "rgba(239, 68, 68, 0.06)" : "rgba(34, 197, 94, 0.08)",
          }}
        >
          <p
            style={{
              margin: 0,
              color: error ? "var(--onyx-error)" : "var(--onyx-success)",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {error ?? success}
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <DashboardCard title="Summary">
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 0.75rem", fontSize: "0.875rem" }}>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Case</dt>
            <dd style={{ margin: 0 }}>
              <Link href={`/dashboard/cases/${request.caseId}`} className="onyx-link">
                {caseLabel}
              </Link>
            </dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Status</dt>
            <dd style={{ margin: 0 }}>{request.statusLabel ?? request.status}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Request date</dt>
            <dd style={{ margin: 0 }}>{formatDate(request.requestDate)}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Sent at</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(request.sentAt)}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Response date</dt>
            <dd style={{ margin: 0 }}>{formatDate(request.responseDate)}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Due</dt>
            <dd style={{ margin: 0 }}>{formatDate(request.dueAt)}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Updated</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(request.updatedAt ?? request.createdAt)}</dd>
          </dl>
        </DashboardCard>

        <DashboardCard title="Delivery">
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 0.75rem", fontSize: "0.875rem" }}>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Method</dt>
            <dd style={{ margin: 0 }}>{request.destinationType ?? "—"}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Saved target</dt>
            <dd style={{ margin: 0 }}>{request.destinationValue ?? "—"}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Follow-ups</dt>
            <dd style={{ margin: 0 }}>{request.followUpCount ?? 0}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Last follow-up</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(request.lastFollowUpAt)}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Completed</dt>
            <dd style={{ margin: 0 }}>{formatDateTime(request.completedAt)}</dd>
          </dl>
        </DashboardCard>
      </div>

      <DashboardCard title="Request details" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Provider name</label>
            <input value={providerName} onChange={(e) => setProviderName(e.target.value)} className="onyx-input" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Provider contact</label>
            <input value={providerContact} onChange={(e) => setProviderContact(e.target.value)} className="onyx-input" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Requested from</label>
            <input type="date" value={requestedDateFrom} onChange={(e) => setRequestedDateFrom(e.target.value)} className="onyx-input" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Requested to</label>
            <input type="date" value={requestedDateTo} onChange={(e) => setRequestedDateTo(e.target.value)} className="onyx-input" style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="onyx-input" style={{ width: "100%" }} />
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="onyx-input"
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <button type="button" onClick={handleSave} disabled={saveLoading} className="onyx-btn-primary">
            {saveLoading ? "Saving…" : "Save request details"}
          </button>
        </div>
      </DashboardCard>

      <DashboardCard title="Letter workflow" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
          Edit the operator-facing request letter, generate a stored PDF, send it to the provider, or download the current PDF directly.
        </p>

        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Letter body</label>
        <textarea
          value={letterBody}
          onChange={(e) => setLetterBody(e.target.value)}
          rows={14}
          className="onyx-input"
          style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          placeholder="Enter or edit the records request letter text…"
        />

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <button type="button" onClick={handleSave} disabled={saveLoading} className="onyx-btn-primary">
            {saveLoading ? "Saving…" : "Save letter"}
          </button>
          <button type="button" onClick={handleGeneratePdf} disabled={generateLoading || !letterBody.trim()} className="onyx-btn-secondary">
            {generateLoading ? "Generating…" : "Generate PDF"}
          </button>
          <button type="button" onClick={handleDownloadPdf} disabled={downloadLoading || !letterBody.trim()} className="onyx-btn-secondary">
            {downloadLoading ? "Downloading…" : "Download current PDF"}
          </button>
          {canSend && (
            <button
              type="button"
              onClick={() => {
                setSendOpen((open) => !open);
                setError(null);
                setSuccess(null);
              }}
              className="onyx-btn-primary"
              style={{ background: "var(--onyx-success)", borderColor: "var(--onyx-success)" }}
            >
              {sendOpen ? "Close send panel" : "Send request"}
            </button>
          )}
        </div>

        {request.generatedDocumentId && (
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.875rem" }}>
            <Link href={`/dashboard/documents/${request.generatedDocumentId}`} className="onyx-link">
              View generated PDF document
            </Link>
          </p>
        )}

        {sendOpen && canSend && (
          <form
            onSubmit={handleSend}
            style={{
              marginTop: "1rem",
              padding: "1rem",
              border: "1px solid var(--onyx-border-subtle)",
              borderRadius: "var(--onyx-radius-md)",
              background: "var(--onyx-background-surface)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "0.75rem", alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>Channel</label>
                <select value={sendChannel} onChange={(e) => setSendChannel(e.target.value as "email" | "fax")} className="onyx-input" style={{ width: "100%" }}>
                  <option value="email">Email</option>
                  <option value="fax">Fax</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {sendChannel === "email" ? "Destination email" : "Destination fax"}
                </label>
                <input
                  type={sendChannel === "email" ? "email" : "text"}
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  className="onyx-input"
                  style={{ width: "100%" }}
                  placeholder={sendChannel === "email" ? "name@example.com" : "Fax number"}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
              <button type="submit" disabled={sendLoading} className="onyx-btn-primary">
                {sendLoading ? "Sending…" : "Send now"}
              </button>
            </div>
          </form>
        )}
      </DashboardCard>

      <DashboardCard title="Delivery attempts" style={{ marginBottom: "1rem" }}>
        <DataTable columns={attemptColumns} data={attempts} emptyMessage="No delivery attempts yet." />
      </DashboardCard>

      <DashboardCard title="Attachments" style={{ marginBottom: "1rem" }}>
        {request.attachments.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
            {request.attachments.map((attachment) => (
              <li key={attachment.id} style={{ marginBottom: "0.35rem" }}>
                <span className="onyx-badge onyx-badge-neutral" style={{ marginRight: "0.5rem" }}>
                  {attachment.kind}
                </span>
                <Link href={`/dashboard/documents/${attachment.documentId}`} className="onyx-link">
                  {attachment.documentId.slice(0, 12)}…
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No attachments yet.</p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--onyx-border-subtle)" }}>
          <input
            type="text"
            value={attachDocId}
            onChange={(e) => setAttachDocId(e.target.value)}
            placeholder="Document ID"
            className="onyx-input"
            style={{ width: 180 }}
          />
          <select value={attachKind} onChange={(e) => setAttachKind(e.target.value)} className="onyx-input" style={{ minWidth: 150 }}>
            <option value="RESPONSE_DOC">Response / returned doc</option>
            <option value="AUTHORIZATION">Authorization</option>
            <option value="LETTER">Letter</option>
            <option value="SUPPORTING_DOC">Supporting doc</option>
          </select>
          <button type="button" onClick={attachDocument} disabled={attachLoading || !attachDocId.trim()} className="onyx-btn-primary">
            {attachLoading ? "Attaching…" : "Attach document"}
          </button>
        </div>
      </DashboardCard>

      <DashboardCard title="Event timeline" style={{ marginBottom: "1rem" }}>
        {request.events.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
            {request.events.map((event) => (
              <li key={event.id} style={{ marginBottom: "0.5rem" }}>
                <span style={{ color: "var(--onyx-text-muted)", marginRight: "0.5rem" }}>{formatDateTime(event.createdAt)}</span>
                <strong>{event.eventType}</strong>
                {event.status && <span style={{ marginLeft: "0.35rem", color: "var(--onyx-text-muted)" }}>{event.status}</span>}
                {event.message && <span style={{ marginLeft: "0.35rem" }}>— {event.message}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No event history yet.</p>
        )}
      </DashboardCard>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {canFollowUp && (
          <button type="button" onClick={sendFollowUp} disabled={action !== null} className="onyx-btn-primary">
            {action === "follow-up" ? "Sending…" : "Send follow-up"}
          </button>
        )}
        {canReceive && (
          <button type="button" onClick={markReceived} disabled={action !== null} className="onyx-btn-primary">
            {action === "receive" ? "Updating…" : "Mark as received"}
          </button>
        )}
        {canComplete && (
          <button type="button" onClick={markComplete} disabled={action !== null} className="onyx-btn-primary">
            {action === "complete" ? "Updating…" : "Mark completed"}
          </button>
        )}
        {canMarkFailed && (
          <button
            type="button"
            onClick={markFailed}
            disabled={action !== null}
            className="onyx-btn-secondary"
            style={{ borderColor: "var(--onyx-error)", color: "var(--onyx-error)" }}
          >
            {action === "failed" ? "Updating…" : "Mark as failed"}
          </button>
        )}
      </div>
    </div>
  );
}
