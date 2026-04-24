"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import {
  formatApiClientError,
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

type CaseOption = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
};

type ProviderOption = {
  id: string;
  name: string;
  email?: string | null;
  fax?: string | null;
};

type Template = {
  id: string;
  name: string;
  requestType: string | null;
  subject: string | null;
  body: string | null;
  isDefault: boolean;
};

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
  const apiBase = getApiBase();
  const apiReady = Boolean(apiBase);

  const [cases, setCases] = useState<CaseOption[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providerName, setProviderName] = useState("");
  const [requestType, setRequestType] = useState<"RECORDS" | "BILLS" | "BOTH">("RECORDS");
  const [destinationType, setDestinationType] = useState<"EMAIL" | "FAX" | "PORTAL" | "MANUAL">("EMAIL");
  const [destinationValue, setDestinationValue] = useState("");
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [requestedDateFrom, setRequestedDateFrom] = useState("");
  const [requestedDateTo, setRequestedDateTo] = useState("");
  const [patientName, setPatientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"case" | "provider" | "destination" | null>(null);

  useEffect(() => {
    if (!apiReady) {
      setError("Records requests need a configured API target before drafts can be created.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void Promise.all([
      fetch(`${apiBase}/cases`, { headers: getAuthHeader(), ...getFetchOptions() }).then(parseJsonResponse),
      fetch(`${apiBase}/providers`, { headers: getAuthHeader(), ...getFetchOptions() })
        .then(parseJsonResponse)
        .catch(() => ({ ok: false, items: [] })),
      fetch(`${apiBase}/records-requests/templates`, { headers: getAuthHeader(), ...getFetchOptions() })
        .then(parseJsonResponse)
        .catch(() => ({ ok: false, templates: [] })),
    ])
      .then(([casesRes, providersRes, templatesRes]) => {
        if (cancelled) return;
        const casesData = casesRes as { ok?: boolean; items?: CaseOption[] };
        const providersData = providersRes as { ok?: boolean; items?: ProviderOption[] };
        const templatesData = templatesRes as { ok?: boolean; templates?: Template[] };
        if (casesData.ok && Array.isArray(casesData.items)) setCases(casesData.items);
        if (providersData.ok && Array.isArray(providersData.items)) setProviders(providersData.items);
        if (templatesData.ok && Array.isArray(templatesData.templates)) setTemplates(templatesData.templates);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(formatApiClientError(nextError, "Failed to load records request helpers."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiBase, apiReady]);

  useEffect(() => {
    const nextCaseId = searchParams?.get("caseId");
    const nextProviderId = searchParams?.get("providerId");
    const nextRequestType = searchParams?.get("requestType");

    if (nextCaseId?.trim()) setCaseId(nextCaseId.trim());
    if (nextProviderId?.trim()) setProviderId(nextProviderId.trim());
    if (nextRequestType === "RECORDS" || nextRequestType === "BILLS" || nextRequestType === "BOTH") {
      setRequestType(nextRequestType);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!providerId || providers.length === 0) return;
    const provider = providers.find((candidate) => candidate.id === providerId);
    if (!provider) return;
    setProviderName(provider.name);
    if (destinationType === "EMAIL" && provider.email) setDestinationValue(provider.email);
    if (destinationType === "FAX" && provider.fax) setDestinationValue(provider.fax);
  }, [providerId, destinationType, providers]);

  useEffect(() => {
    if (!selectedTemplateId || templates.length === 0) return;
    const template = templates.find((candidate) => candidate.id === selectedTemplateId);
    if (!template) return;
    if (template.subject) setSubject(template.subject);
    if (template.body) setMessageBody(template.body);
    if (template.requestType === "RECORDS" || template.requestType === "BILLS" || template.requestType === "BOTH") {
      setRequestType(template.requestType);
    }
  }, [selectedTemplateId, templates]);

  function clearErrors() {
    setError(null);
    setFieldError(null);
  }

  function scrollToError() {
    errorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function buildBody() {
    const body: Record<string, unknown> = {
      caseId,
      requestType,
      destinationType,
      providerName: providerId ? undefined : providerName.trim() || undefined,
      subject: subject.trim() || undefined,
      messageBody: messageBody.trim() || undefined,
      requestedDateFrom: requestedDateFrom || undefined,
      requestedDateTo: requestedDateTo || undefined,
      patientName: patientName.trim() || undefined,
    };
    if (providerId) body.providerId = providerId;
    if (destinationValue.trim()) body.destinationValue = destinationValue.trim();
    return body;
  }

  function validateForSubmit(): boolean {
    if (!caseId.trim()) {
      setError("Please select a case.");
      setFieldError("case");
      scrollToError();
      return false;
    }
    if (!providerId.trim() && !providerName.trim()) {
      setError("Select a saved provider or enter a provider name.");
      setFieldError("provider");
      scrollToError();
      return false;
    }
    if ((destinationType === "EMAIL" || destinationType === "FAX") && !destinationValue.trim()) {
      setError(destinationType === "EMAIL" ? "Please enter an email address." : "Please enter a fax number.");
      setFieldError("destination");
      scrollToError();
      return false;
    }
    return true;
  }

  async function createDraft(): Promise<string | null> {
    const response = await fetch(`${apiBase}/records-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      ...getFetchOptions(),
      body: JSON.stringify(buildBody()),
    });
    const data = (await parseJsonResponse(response)) as {
      ok?: boolean;
      request?: { id: string };
      error?: string;
    };

    if (!response.ok || !data.ok || !data.request?.id) {
      throw new Error(data.error ?? "Failed to create records request.");
    }

    return data.request.id;
  }

  async function handleSaveDraft() {
    clearErrors();
    if (!validateForSubmit()) return;
    if (!apiReady) {
      setError("Records requests need a configured API target before drafts can be created.");
      return;
    }

    setSaving(true);
    try {
      const requestId = await createDraft();
      if (requestId) router.push(`/dashboard/records-requests/${requestId}`);
    } catch (nextError) {
      setError(formatApiClientError(nextError, "Failed to save draft."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    clearErrors();
    if (!validateForSubmit()) return;
    if (!apiReady) {
      setError("Records requests need a configured API target before send can run.");
      return;
    }

    setSending(true);
    try {
      const requestId = await createDraft();
      if (!requestId) return;

      const sendResponse = await fetch(`${apiBase}/records-requests/${requestId}/send`, {
        method: "POST",
        headers: getAuthHeader() as HeadersInit,
        ...getFetchOptions(),
      });
      const sendData = (await parseJsonResponse(sendResponse)) as {
        ok?: boolean;
        error?: string;
      };

      if (!sendResponse.ok || !sendData.ok) {
        setError(sendData.error ?? "Request created but send failed. You can retry from the request page.");
        router.push(`/dashboard/records-requests/${requestId}`);
        return;
      }

      router.push(`/dashboard/records-requests/${requestId}`);
    } catch (nextError) {
      setError(formatApiClientError(nextError, "Request failed."));
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
        description="Create a records or billing request, generate the letter PDF, and send it from one workflow."
        action={
          <Link href="/dashboard/records-requests" className="onyx-link" style={{ fontSize: "0.875rem" }}>
            Back to list
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

      {!apiReady && (
        <DashboardCard style={{ maxWidth: "40rem", marginBottom: "1.5rem" }}>
          <h2 style={sectionTitleStyle}>API target required</h2>
          <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            Records request creation, PDF generation, and send all depend on the JSON API target. Configure the API URL first, then return here.
          </p>
        </DashboardCard>
      )}

      <div style={{ maxWidth: "40rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <DashboardCard>
          <h2 style={sectionTitleStyle}>1. Case and provider</h2>
          <p style={sectionSubtitleStyle}>Choose the case, then use a saved provider or type the provider name manually.</p>

          <div style={fieldGap}>
            <label htmlFor="rr-case" style={labelStyle}>
              Case <span style={{ color: "var(--onyx-error)" }}>*</span>
            </label>
            <select
              id="rr-case"
              value={caseId}
              onChange={(event) => {
                setCaseId(event.target.value);
                if (fieldError === "case") setFieldError(null);
              }}
              className="onyx-input"
              style={{ ...inputStyle, borderColor: fieldError === "case" ? "var(--onyx-error)" : undefined }}
              aria-invalid={fieldError === "case"}
              aria-describedby={fieldError === "case" ? "rr-case-error" : undefined}
            >
              <option value="">{cases.length === 0 ? "No cases available" : "Select a case"}</option>
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {[item.caseNumber, item.title, item.clientName].filter(Boolean).join(" - ") || item.id.slice(0, 8)}
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
              Saved provider <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <select
              id="rr-provider"
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value);
                if (!event.target.value) setProviderName("");
                if (fieldError === "provider") setFieldError(null);
              }}
              className="onyx-input"
              style={inputStyle}
            >
              <option value="">{providers.length === 0 ? "No saved providers yet" : "None"}</option>
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {providers.length === 0 && (
              <p style={{ margin: "0.375rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
                You can still create a request by entering the provider name manually below.
              </p>
            )}
          </div>

          <div style={fieldGap}>
            <label htmlFor="rr-provider-name" style={labelStyle}>
              Provider name <span style={{ color: "var(--onyx-error)" }}>*</span>
            </label>
            <input
              id="rr-provider-name"
              type="text"
              value={providerName}
              onChange={(event) => {
                setProviderName(event.target.value);
                if (fieldError === "provider") setFieldError(null);
              }}
              className="onyx-input"
              style={{ ...inputStyle, borderColor: fieldError === "provider" ? "var(--onyx-error)" : undefined }}
              placeholder="Records department or provider name"
              disabled={Boolean(providerId)}
            />
            {providerId && (
              <p style={{ margin: "0.375rem 0 0", fontSize: "0.75rem", color: "var(--onyx-text-muted)" }}>
                This stays in sync with the saved provider you selected above.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="rr-patient" style={labelStyle}>
              Patient name <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              id="rr-patient"
              type="text"
              value={patientName}
              onChange={(event) => setPatientName(event.target.value)}
              className="onyx-input"
              style={inputStyle}
              placeholder="As it appears on the records"
            />
          </div>
        </DashboardCard>

        <DashboardCard>
          <h2 style={sectionTitleStyle}>2. Request type and dates</h2>
          <p style={sectionSubtitleStyle}>Choose what you need and the relevant date range, if any.</p>

          <div style={fieldGap}>
            <label htmlFor="rr-type" style={labelStyle}>Request type</label>
            <select
              id="rr-type"
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as "RECORDS" | "BILLS" | "BOTH")}
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
              <label htmlFor="rr-date-from" style={labelStyle}>
                Date range from <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="rr-date-from"
                type="date"
                value={requestedDateFrom}
                onChange={(event) => setRequestedDateFrom(event.target.value)}
                className="onyx-input"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="rr-date-to" style={labelStyle}>
                Date range to <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="rr-date-to"
                type="date"
                value={requestedDateTo}
                onChange={(event) => setRequestedDateTo(event.target.value)}
                className="onyx-input"
                style={inputStyle}
              />
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <h2 style={sectionTitleStyle}>3. Destination</h2>
          <p style={sectionSubtitleStyle}>Choose how the request should be delivered or followed up.</p>

          <div style={fieldGap}>
            <label htmlFor="rr-dest-type" style={labelStyle}>Delivery method</label>
            <select
              id="rr-dest-type"
              value={destinationType}
              onChange={(event) => {
                setDestinationType(event.target.value as "EMAIL" | "FAX" | "PORTAL" | "MANUAL");
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
              {destinationType === "EMAIL"
                ? "Email address"
                : destinationType === "FAX"
                  ? "Fax number"
                  : "Destination details"}
            </label>
            <input
              id="rr-dest-value"
              type="text"
              value={destinationValue}
              onChange={(event) => {
                setDestinationValue(event.target.value);
                if (fieldError === "destination") setFieldError(null);
              }}
              className="onyx-input"
              style={{ ...inputStyle, borderColor: fieldError === "destination" ? "var(--onyx-error)" : undefined }}
              placeholder={
                destinationType === "EMAIL"
                  ? "records@provider.com"
                  : destinationType === "FAX"
                    ? "(555) 123-4567"
                    : "Optional notes or portal instructions"
              }
            />
          </div>
        </DashboardCard>

        <DashboardCard>
          <h2 style={sectionTitleStyle}>4. Message</h2>
          <p style={sectionSubtitleStyle}>Start from a saved template or draft the message manually.</p>

          {templates.length > 0 && (
            <div style={fieldGap}>
              <label htmlFor="rr-template" style={labelStyle}>
                Template <span style={{ color: "var(--onyx-text-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <select
                id="rr-template"
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="onyx-input"
                style={inputStyle}
              >
                <option value="">None - write from scratch</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.isDefault ? " (default)" : ""}
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
              onChange={(event) => setSubject(event.target.value)}
              className="onyx-input"
              style={inputStyle}
              placeholder="Medical Records Request"
            />
          </div>

          <div>
            <label htmlFor="rr-body" style={labelStyle}>Message body</label>
            <textarea
              id="rr-body"
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              rows={6}
              className="onyx-input"
              style={{ width: "100%", resize: "vertical", minHeight: "8rem", padding: "0.5rem 0.75rem" }}
              placeholder="Please provide the requested records and billing statements for the date range above."
            />
          </div>
        </DashboardCard>

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
          <div style={{ color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>
            {loading
              ? "Loading request helpers..."
              : cases.length === 0
                ? "Create or import a case first, then return here."
                : "Save a draft first or send immediately once the request is ready."}
          </div>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href="/dashboard/records-requests" className="onyx-link" style={{ fontSize: "0.875rem", alignSelf: "center" }}>
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isBusy || loading || !apiReady || cases.length === 0}
              className="onyx-btn-secondary"
            >
              {saving ? "Saving..." : "Save draft"}
            </button>
            <button
              type="button"
              onClick={handleSendNow}
              disabled={isBusy || loading || !apiReady || cases.length === 0}
              className="onyx-btn-primary"
            >
              {sending ? "Sending..." : "Send now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
