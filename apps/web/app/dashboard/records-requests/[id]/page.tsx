"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type Attachment = { id: string; kind: string; documentId: string; createdAt: string };
type Event = { id: string; eventType: string; status: string | null; message: string | null; createdAt: string };
type RequestDetail = {
  id: string;
  firmId: string;
  caseId: string;
  providerId: string | null;
  providerName: string;
  providerContact: string | null;
  status: string;
  requestType: string | null;
  destinationType: string | null;
  destinationValue: string | null;
  subject: string | null;
  messageBody: string | null;
  requestedDateFrom: string | null;
  requestedDateTo: string | null;
  sentAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  followUpCount: number | null;
  lastFollowUpAt: string | null;
  createdAt: string;
  attachments: Attachment[];
  events: Event[];
};

function statusBadgeClass(status: string): string {
  if (status === "COMPLETED") return "onyx-badge onyx-badge-success";
  if (status === "FAILED") return "onyx-badge onyx-badge-error";
  if (status === "SENT" || status === "RECEIVED") return "onyx-badge onyx-badge-info";
  if (status === "FOLLOW_UP_DUE") return "onyx-badge onyx-badge-warning";
  return "onyx-badge onyx-badge-neutral";
}

export default function RecordsRequestDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [action, setAction] = useState<"follow-up" | "complete" | "receive" | "failed" | null>(null);
  const [attachDocId, setAttachDocId] = useState("");
  const [attachKind, setAttachKind] = useState<string>("RESPONSE_DOC");
  const [attachLoading, setAttachLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`${getApiBase()}/records-requests/${id}`, { headers: getAuthHeader(), ...getFetchOptions() })
      .then(parseJsonResponse)
      .then((data) => {
        const d = data as { ok?: boolean; request?: RequestDetail; error?: string };
        if (d.ok) setRequest(d.request ?? null);
        else setError(d.error ?? "Not found");
      })
      .catch((e) => setError(e?.message ?? "Request failed"))
      .finally(() => setLoading(false));
  }, [id]);

  const clearError = () => { setError(null); setActionSuccess(null); };

  async function sendFollowUp() {
    if (!id) return;
    setAction("follow-up"); setError(null); setActionSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${id}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; request?: RequestDetail; error?: string };
      if (data.ok) { setRequest(data.request ?? null); setActionSuccess("Follow-up sent."); }
      else setError(data.error ?? "Follow-up failed");
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setAction(null); }
  }

  async function markComplete() {
    if (!id) return;
    setAction("complete"); setError(null); setActionSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${id}/complete`, { method: "POST", headers: getAuthHeader() as HeadersInit });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; request?: RequestDetail; error?: string };
      if (data.ok) { setRequest(data.request ?? null); setActionSuccess("Marked as completed."); }
      else setError(data.error ?? "Failed");
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setAction(null); }
  }

  async function markReceived() {
    if (!id) return;
    setAction("receive"); setError(null); setActionSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; request?: RequestDetail; error?: string };
      if (data.ok) { setRequest(data.request ?? null); setActionSuccess("Marked as received."); }
      else setError(data.error ?? "Failed");
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setAction(null); }
  }

  async function markFailed() {
    if (!id) return;
    setAction("failed"); setError(null); setActionSuccess(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${id}/mark-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ message: "Marked as failed from dashboard" }),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; request?: RequestDetail; error?: string };
      if (data.ok) { setRequest(data.request ?? null); setActionSuccess("Marked as failed."); }
      else setError(data.error ?? "Failed");
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setAction(null); }
  }

  async function attachDocument() {
    if (!id || !attachDocId.trim()) return;
    setAttachLoading(true); setError(null);
    try {
      const res = await fetch(`${getApiBase()}/records-requests/${id}/attach-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ documentId: attachDocId.trim(), kind: attachKind }),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; request?: RequestDetail; error?: string };
      if (data.ok) { setRequest(data.request ?? null); setAttachDocId(""); setActionSuccess("Document attached."); }
      else setError(data.error ?? "Attach failed");
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setAttachLoading(false); }
  }

  if (loading) {
    return (
      <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Records requests", href: "/dashboard/records-requests" }, { label: "…" }]} title="Records request" description="Loading…" />
        <div className="onyx-card" style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)" }}>Loading…</p>
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
          <Link href="/dashboard/records-requests" className="onyx-link" style={{ display: "inline-block", marginTop: "0.5rem" }}>Back to list</Link>
        </div>
      </div>
    );
  }
  if (!request) return null;

  const canFollowUp = (request.status === "SENT" || request.status === "FOLLOW_UP_DUE") && request.destinationValue;
  const canComplete = request.status !== "CANCELLED" && request.status !== "COMPLETED";
  const canReceive = ["SENT", "FOLLOW_UP_DUE", "DRAFT"].includes(request.status);
  const canMarkFailed = ["DRAFT", "SENT", "FOLLOW_UP_DUE"].includes(request.status);

  return ( <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Records requests", href: "/dashboard/records-requests" }, { label: request.providerName }]}
        title={request.providerName}
        description={`${request.requestType ?? "—"} · Case ${request.caseId.slice(0, 8)}…`}
        action={
          <span className={statusBadgeClass(request.status)} style={{ textTransform: "uppercase", fontSize: "0.75rem" }}>
            {request.status.replace(/_/g, " ")}
          </span>
        }
      />
      <Link href="/dashboard/records-requests" className="onyx-link" style={{ fontSize: "0.875rem", display: "inline-block", marginBottom: "1rem" }}>
        ← Back to list
      </Link>

      {error && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{error}</p>
        </div>
      )}
      {actionSuccess && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-success)" }}>
          <p style={{ margin: 0, color: "var(--onyx-success)", fontSize: "0.875rem" }}>{actionSuccess}</p>
        </div>
      )}

      <div style={{ maxWidth: "40rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <DashboardCard title="Summary">
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.25rem 1rem", fontSize: "0.875rem" }}>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Provider</dt>
            <dd style={{ margin: 0, fontWeight: 500 }}>{request.providerName}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Contact</dt>
            <dd style={{ margin: 0 }}>{request.providerContact ?? "—"}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Destination</dt>
            <dd style={{ margin: 0 }}>{request.destinationType}: {request.destinationValue ?? "—"}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Subject</dt>
            <dd style={{ margin: 0 }}>{request.subject ?? "—"}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Sent</dt>
            <dd style={{ margin: 0 }}>{request.sentAt ? new Date(request.sentAt).toLocaleString() : "—"}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Due</dt>
            <dd style={{ margin: 0 }}>{request.dueAt ? new Date(request.dueAt).toLocaleDateString() : "—"}</dd>
            <dt style={{ color: "var(--onyx-text-muted)" }}>Follow-ups</dt>
            <dd style={{ margin: 0 }}>{request.followUpCount ?? 0}</dd>
          </dl>
          {request.messageBody && (
            <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--onyx-border-subtle)" }}>
              <p style={{ margin: "0 0 0.25rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Message body</p>
              <pre style={{ margin: 0, fontSize: "0.8125rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{request.messageBody}</pre>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Attachments">
          {request.attachments?.length ? (
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {request.attachments.map((a) => (
                <li key={a.id} style={{ marginBottom: "0.25rem", fontSize: "0.875rem" }}>
                  <span className="onyx-badge onyx-badge-neutral" style={{ marginRight: "0.5rem" }}>{a.kind}</span>
                  <Link href={`/dashboard/documents/${a.documentId}`} className="onyx-link">{a.documentId.slice(0, 12)}…</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No attachments</p>
          )}
          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--onyx-border-subtle)" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", fontWeight: 500 }}>Attach returned document</p>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>Link a document (e.g. records received) to this request. Use document ID from the Documents list.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="text"
                value={attachDocId}
                onChange={(e) => setAttachDocId(e.target.value)}
                placeholder="Document ID"
                className="onyx-input"
                style={{ width: 160 }}
              />
              <select value={attachKind} onChange={(e) => setAttachKind(e.target.value)} className="onyx-input" style={{ minWidth: 140 }}>
                <option value="RESPONSE_DOC">Response / returned doc</option>
                <option value="AUTHORIZATION">Authorization</option>
                <option value="LETTER">Letter</option>
                <option value="SUPPORTING_DOC">Supporting doc</option>
              </select>
              <button type="button" onClick={attachDocument} disabled={attachLoading || !attachDocId.trim()} className="onyx-btn-primary">
                {attachLoading ? "Adding…" : "Attach"}
              </button>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Event timeline">
          {request.events?.length ? ( <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
              {request.events.map((e) => ( <li key={e.id} style={{ marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--onyx-text-muted)", marginRight: "0.5rem" }}>{new Date(e.createdAt).toLocaleString()}</span>
                  <strong>{e.eventType}</strong>
                  {e.status && <span style={{ marginLeft: "0.25rem", color: "var(--onyx-text-muted)" }}>{e.status}</span>}
                  {e.message && <span style={{ marginLeft: "0.25rem" }}>{" — "}{e.message}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>No events yet</p>
          )}
        </DashboardCard>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
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
            <button type="button" onClick={markFailed} disabled={action !== null} className="onyx-btn-secondary" style={{ borderColor: "var(--onyx-error)", color: "var(--onyx-error)" }}>
              {action === "failed" ? "Updating…" : "Mark as failed"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
