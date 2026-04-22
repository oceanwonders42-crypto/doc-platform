"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getApiBase, getAuthHeader, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type Case = { id: string; title: string | null; caseNumber: string | null; clientName: string | null };
type Provider = { id: string; name: string; email?: string | null; fax?: string | null };
type Template = { id: string; name: string; requestType: string | null; subject: string | null; body: string | null; isDefault: boolean };

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "0.375rem",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "var(--onyx-text-muted)",
};
const fieldGap: React.CSSProperties = { marginBottom: "1.125rem" };
const inputStyle: React.CSSProperties = { width: "100%", minHeight: "2.5rem" };
const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "var(--onyx-text)",
  letterSpacing: "-0.01em",
};
const sectionSubtitleStyle: React.CSSProperties = {
  margin: "0 0 1rem",
  fontSize: "0.8125rem",
  color: "var(--onyx-text-muted)",
  lineHeight: 1.4,
};

export default function NewRecordsRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorRef = useRef<HTMLDivElement>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [caseId, setCaseId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [requestType, setRequestType] = useState<"RECORDS" | "BILLS" | "BOTH">("RECORDS");
  const [destinationType, setDestinationType] = useState<"EMAIL" | "FAX" | "PORTAL" | "MANUAL">("EMAIL");
  const [destinationValue, setDestinationValue] = useState("");
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [requestedDateFrom, setRequestedDateFrom] = useState("");
  const [requestedDateTo, setRequestedDateTo] = useState("");
  const [patientName, setPatientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"case" | "destination" | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${getApiBase()}/cases`, { headers: getAuthHeader() }).then(parseJsonResponse),
      fetch(`${getApiBase()}/providers`, { headers: getAuthHeader() }).then(parseJsonResponse).catch(() => ({ ok: false })),
      fetch(`${getApiBase()}/records-requests/templates`, { headers: getAuthHeader() }).then(parseJsonResponse).catch(() => ({ ok: false, templates: [] })),
    ]).then(([casesRes, providersRes, templatesRes]) => {
      const casesData = casesRes as { ok?: boolean; items?: Case[] };
      const providersData = providersRes as { ok?: boolean; items?: Provider[] };
      const templatesData = templatesRes as { ok?: boolean; templates?: Template[] };
      if (casesData.ok && Array.isArray(casesData.items)) setCases(casesData.items);
      if (Array.isArray(providersData?.items)) setProviders(providersData.items);
      if (templatesData?.ok && Array.isArray(templatesData.templates)) setTemplates(templatesData.templates);
    });
  }, []);

  useEffect(() => {
    const qCaseId = searchParams?.get("caseId");
    const qProviderId = searchParams?.get("providerId");
    const qRequestType = searchParams?.get("requestType");
    if (qCaseId && qCaseId.trim()) setCaseId(qCaseId.trim());
    if (qProviderId && qProviderId.trim()) setProviderId(qProviderId.trim());
    if (qRequestType === "RECORDS" || qRequestType === "BILLS" || qRequestType === "BOTH") setRequestType(qRequestType);
  }, [searchParams]);

  useEffect(() => {
    if (providerId && providers.length) {
      const p = providers.find((x) => x.id === providerId);
      if (p && destinationType === "EMAIL" && p.email) setDestinationValue(p.email);
      if (p && destinationType === "FAX" && p.fax) setDestinationValue(p.fax);
    }
  }, [providerId, destinationType, providers]);

  useEffect(() => {
    if (!selectedTemplateId || !templates.length) return;
    const t = templates.find((x) => x.id === selectedTemplateId);
    if (t) {
      if (t.subject) setSubject(t.subject);
      if (t.body) setMessageBody(t.body);
      if (t.requestType === "RECORDS" || t.requestType === "BILLS" || t.requestType === "BOTH") setRequestType(t.requestType);
    }
  }, [selectedTemplateId, templates]);

  const clearErrors = () => {
    setError(null);
    setFieldError(null);
  };

  function buildBody() {
    const body: Record<string, unknown> = {
      caseId,
      requestType,
      destinationType,
      subject: subject || undefined,
      messageBody: messageBody || undefined,
      requestedDateFrom: requestedDateFrom || undefined,
      requestedDateTo: requestedDateTo || undefined,
      patientName: patientName || undefined,
    };
    if (providerId) body.providerId = providerId;
    if (destinationValue) body.destinationValue = destinationValue;
    return body;
  }

  function validateForSubmit(): boolean {
    if (!caseId.trim()) {
      setError("Please select a case.");
      setFieldError("case");
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return false;
    }
    if ((destinationType === "EMAIL" || destinationType === "FAX") && !destinationValue.trim()) {
      setError(destinationType === "EMAIL" ? "Please enter an email address." : "Please enter a fax number.");
      setFieldError("destination");
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return false;
    }
    return true;
  }

  async function handleSaveDraft() {
    clearErrors();
    if (!caseId.trim()) {
      setError("Please select a case to save a draft.");
      setFieldError("case");
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${getApiBase()}/records-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(buildBody()),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; request?: { id: string }; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Failed to save draft.");
        return;
      }
      router.push(`/dashboard/records-requests/${data.request!.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    clearErrors();
    if (!validateForSubmit()) return;
    setSending(true);
    try {
      const createRes = await fetch(`${getApiBase()}/records-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(buildBody()),
      });
      const createData = (await parseJsonResponse(createRes)) as { ok?: boolean; request?: { id: string }; error?: string };
      if (!createData.ok) {
        setError(createData.error ?? "Failed to create request.");
        setSending(false);
        return;
      }
      const id = createData.request!.id;
      const sendRes = await fetch(`${getApiBase()}/records-requests/${id}/send`, {
        method: "POST",
        headers: getAuthHeader() as HeadersInit,
      });
      const sendData = (await parseJsonResponse(sendRes)) as { ok?: boolean; request?: unknown; error?: string };
      if (!sendData.ok) {
        setError(sendData.error ?? "Request created but send failed. You can retry from the request page.");
        router.push(`/dashboard/records-requests/${id}`);
        return;
      }
      router.push(`/dashboard/records-requests/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setSending(false);
    }
  }

  const isBusy = saving || sending;

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Records requests", href: "/dashboard/records-requests" }, { label: "New" }]}
        title="New records request"
        description="Create a medical records or bills request for a case. Required fields are marked with *."
        action={
          <Link href="/dashboard/records-requests" className="onyx-link" style={{ fontSize: "0.875rem" }}>
            ← Back to list
          </Link>
        }
      />

      {error && (
        <div
          ref={errorRef}
          role="alert"
          className="onyx-card"
          style={{
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
            borderColor: "var(--onyx-error)",
            background: "rgba(239, 68, 68, 0.06)",
          }}
        >
          <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem", fontWeight: 500 }}>{error}</p>
        </div>
      )}

      <div style={{ maxWidth: "40rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Section 1: Case & provider */}
        <DashboardCard>
          <h2 style={sectionTitleStyle}>1. Case & provider</h2>
          <p style={sectionSubtitleStyle}>Choose the case and optionally the healthcare provider. Case is required.</p>
          <div style={fieldGap}>
            <label htmlFor="rr-case" style={labelStyle}>
              Case <span style={{ color: "var(--onyx-error)" }}>*</span>
            </label>
            <select
              id="rr-case"
              value={caseId}
              onChange={(e) => {
                setCaseId(e.target.value);
                if (fieldError === "case") setFieldError(null);
              }}
              className="onyx-input"
              style={{ ...inputStyle, borderColor: fieldError === "case" ? "var(--onyx-error)" : undefined }}
              aria-invalid={fieldError === "case"}
              aria-describedby={fieldError === "case" ? "rr-case-error" : undefined}
            >
              <option value="">Select a case</option>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.caseNumber, c.title, c.clientName].filter(Boolean).join(" — ") || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
            {fieldError === "case" && (
              <p id="rr-case-error" style={{ margin: "0.375rem 0 0", fontSize: "0.75rem", color: "var(--onyx-error)" }}>
                Select a case to continue.
              </p>
            )}
          </div>
          <div style={fieldGap}>
            <label htmlFor="rr-provider" style={labelStyle}>
              Provider <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <select
              id="rr-provider"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="onyx-input"
              style={inputStyle}
            >
              <option value="">None</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rr-patient" style={labelStyle}>
              Patient name <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="rr-patient"
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="onyx-input"
              style={inputStyle}
              placeholder="As it appears on records"
            />
          </div>
        </DashboardCard>

        {/* Section 2: Request type & dates */}
        <DashboardCard>
          <h2 style={sectionTitleStyle}>2. Request type & dates</h2>
          <p style={sectionSubtitleStyle}>What to request and the date range, if applicable.</p>
          <div style={fieldGap}>
            <label htmlFor="rr-type" style={labelStyle}>Request type</label>
            <select
              id="rr-type"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as "RECORDS" | "BILLS" | "BOTH")}
              className="onyx-input"
              style={inputStyle}
            >
              <option value="RECORDS">Records only</option>
              <option value="BILLS">Bills only</option>
              <option value="BOTH">Records and bills</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label htmlFor="rr-date-from" style={labelStyle}>Date range from <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span></label>
              <input
                id="rr-date-from"
                type="date"
                value={requestedDateFrom}
                onChange={(e) => setRequestedDateFrom(e.target.value)}
                className="onyx-input"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="rr-date-to" style={labelStyle}>Date range to <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span></label>
              <input
                id="rr-date-to"
                type="date"
                value={requestedDateTo}
                onChange={(e) => setRequestedDateTo(e.target.value)}
                className="onyx-input"
                style={inputStyle}
              />
            </div>
          </div>
        </DashboardCard>

        {/* Section 3: Destination */}
        <DashboardCard>
          <h2 style={sectionTitleStyle}>3. Destination</h2>
          <p style={sectionSubtitleStyle}>How the provider should receive or respond to the request.</p>
          <div style={fieldGap}>
            <label htmlFor="rr-dest-type" style={labelStyle}>Delivery method</label>
            <select
              id="rr-dest-type"
              value={destinationType}
              onChange={(e) => {
                setDestinationType(e.target.value as "EMAIL" | "FAX" | "PORTAL" | "MANUAL");
                if (fieldError === "destination") setFieldError(null);
              }}
              className="onyx-input"
              style={inputStyle}
            >
              <option value="EMAIL">Email</option>
              <option value="FAX">Fax</option>
              <option value="PORTAL">Portal</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
          <div>
            <label htmlFor="rr-dest-value" style={labelStyle}>
              {(destinationType === "EMAIL" || destinationType === "FAX") && (
                <span style={{ color: "var(--onyx-error)" }}>* </span>
              )}
              {destinationType === "EMAIL" ? "Email address" : destinationType === "FAX" ? "Fax number" : "Details"}
            </label>
            <input
              id="rr-dest-value"
              type="text"
              value={destinationValue}
              onChange={(e) => {
                setDestinationValue(e.target.value);
                if (fieldError === "destination") setFieldError(null);
              }}
              className="onyx-input"
              style={{ ...inputStyle, borderColor: fieldError === "destination" ? "var(--onyx-error)" : undefined }}
              placeholder={destinationType === "EMAIL" ? "e.g. records@provider.com" : destinationType === "FAX" ? "e.g. (555) 123-4567" : "Optional"}
              aria-invalid={fieldError === "destination"}
              aria-describedby={fieldError === "destination" ? "rr-dest-error" : undefined}
            />
            {fieldError === "destination" && (
              <p id="rr-dest-error" style={{ margin: "0.375rem 0 0", fontSize: "0.75rem", color: "var(--onyx-error)" }}>
                {destinationType === "EMAIL" ? "Enter an email address." : "Enter a fax number."}
              </p>
            )}
          </div>
        </DashboardCard>

        {/* Section 4: Message */}
        <DashboardCard>
          <h2 style={sectionTitleStyle}>4. Message</h2>
          <p style={sectionSubtitleStyle}>Subject and body for the request. You can start from a template if available.</p>
          {templates.length > 0 && (
            <div style={fieldGap}>
              <label htmlFor="rr-template" style={labelStyle}>Template <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span></label>
              <select
                id="rr-template"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="onyx-input"
                style={inputStyle}
              >
                <option value="">None — write from scratch</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={fieldGap}>
            <label htmlFor="rr-subject" style={labelStyle}>Subject</label>
            <input
              id="rr-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="onyx-input"
              style={inputStyle}
              placeholder="e.g. Medical Records Request — [Client Name]"
            />
          </div>
          <div>
            <label htmlFor="rr-body" style={labelStyle}>Message body</label>
            <textarea
              id="rr-body"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              rows={5}
              className="onyx-input"
              style={{ width: "100%", resize: "vertical", minHeight: "8rem", padding: "0.5rem 0.75rem" }}
              placeholder="Please provide the requested records for the date range above. Thank you."
            />
          </div>
        </DashboardCard>

        {/* Actions */}
        <div
          className="onyx-card"
          style={{
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <Link href="/dashboard/records-requests" className="onyx-link" style={{ fontSize: "0.875rem" }}>
            Cancel
          </Link>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isBusy}
              className="onyx-btn-secondary"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              onClick={handleSendNow}
              disabled={isBusy}
              className="onyx-btn-primary"
            >
              {sending ? "Sending…" : "Send now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
