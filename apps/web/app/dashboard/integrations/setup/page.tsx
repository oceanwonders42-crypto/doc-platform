"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatApiClientError, getApiBase, getAuthHeader, getFetchOptions, parseJsonResponse } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { useDashboardAuth, canAccessIntegrations } from "@/contexts/DashboardAuthContext";

type Step = 1 | 2 | 3 | 4;
type IntegrationChoice = "email" | "api" | "both" | null;
type EmailProvider = "GMAIL" | "OUTLOOK" | "IMAP" | null;
type MailboxCreateResponse = {
  ok?: boolean;
  error?: string;
  mailbox?: {
    id: string;
    status: string;
  };
};

const labelStyle = {
  display: "block",
  marginBottom: "0.35rem",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "var(--onyx-text-muted)",
} as const;
const fieldGap = { marginBottom: "1rem" } as const;

export default function IntegrationsSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, checked } = useDashboardAuth();
  const emailFlowRequested = searchParams.get("flow") === "email";

  const [step, setStep] = useState<Step>(1);
  const [choice, setChoice] = useState<IntegrationChoice>(null);
  const [emailProvider, setEmailProvider] = useState<EmailProvider>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapUsername, setImapUsername] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [apiProvider, setApiProvider] = useState<"CLIO" | "FILEVINE" | "GENERIC">("CLIO");
  const [apiKey, setApiKey] = useState("");
  const [defaultReviewQueue, setDefaultReviewQueue] = useState("default");
  const [autoSync, setAutoSync] = useState(true);
  const [unmatchedHandling, setUnmatchedHandling] = useState("review_queue");
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedMailboxId, setConnectedMailboxId] = useState<string | null>(null);

  useEffect(() => {
    if (!emailFlowRequested) return;
    setChoice("email");
    setStep(2);
  }, [emailFlowRequested]);

  if (checked && !canAccessIntegrations(role)) {
    return (
      <div style={{ padding: "var(--onyx-content-padding)" }}>
        <div className="onyx-card" style={{ padding: "2rem", maxWidth: 480, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Access restricted</h2>
          <p style={{ margin: "0 0 1rem", color: "var(--onyx-text-muted)" }}>
            Only owners and admins can manage Clio and email connections.
          </p>
          <Link href="/dashboard" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  async function connectEmail() {
    if (!emailAddress || !emailProvider || !imapPassword) return;
    setLoading(true);
    setError(null);
    setTestResult(null);

    try {
      const mailboxPayload =
        emailProvider === "IMAP"
          ? {
              imapHost: imapHost || "imap.example.com",
              imapPort: parseInt(imapPort, 10) || 993,
              imapSecure: true,
              imapUsername: imapUsername || emailAddress,
              imapPassword,
              folder: "INBOX",
            }
          : {
              imapHost: emailProvider === "GMAIL" ? "imap.gmail.com" : "outlook.office365.com",
              imapPort: 993,
              imapSecure: true,
              imapUsername: emailAddress,
              imapPassword,
              folder: "INBOX",
            };

      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() } as HeadersInit,
        body: JSON.stringify(mailboxPayload),
        ...getFetchOptions(),
      });
      const data = (await parseJsonResponse(res)) as MailboxCreateResponse;
      if (!data.ok || !data.mailbox?.id) {
        throw new Error(data.error || "Email connection could not be created.");
      }

      const mailboxId = data.mailbox.id;
      setConnectedMailboxId(mailboxId);

      const testRes = await fetch(`/api/mailboxes/${mailboxId}/test`, {
        method: "POST",
        headers: getAuthHeader(),
        ...getFetchOptions(),
      });
      const testData = (await parseJsonResponse(testRes)) as { ok?: boolean; error?: string };
      if (!testData.ok) {
        throw new Error(testData.error || "Mailbox connection test failed.");
      }

      setTestResult({ ok: true });
      if (emailFlowRequested) {
        router.push("/dashboard/integrations?focus=email");
        return;
      }
      setStep(3);
    } catch (e) {
      setError(
        formatApiClientError(e, "Connect Email failed.", {
          deploymentMessage:
            "The email connection proxy reached the wrong server target. Check the mounted /mailboxes API route and the active web build.",
        })
      );
    } finally {
      setLoading(false);
    }
  }

  async function connectApi() {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/integrations/connect-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() } as HeadersInit,
        body: JSON.stringify({ provider: apiProvider, apiKey }),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error || "Connect failed");
      setStep(3);
    } catch (e) {
      setError(
        formatApiClientError(e, "Connect to Clio failed.", {
          deploymentMessage:
            "The Clio connection flow reached the wrong server target. Check NEXT_PUBLIC_API_URL and whether the latest API build is deployed.",
        })
      );
    } finally {
      setLoading(false);
    }
  }

  async function runTest() {
    setLoading(true);
    setTestResult(null);
    setError(null);

    try {
      if (choice === "email" || choice === "both" || emailFlowRequested) {
        if (!connectedMailboxId) {
          throw new Error("Connect an email mailbox before running the connection test.");
        }

        const mailboxTestRes = await fetch(`/api/mailboxes/${connectedMailboxId}/test`, {
          method: "POST",
          headers: getAuthHeader(),
          ...getFetchOptions(),
        });
        const mailboxTestData = (await parseJsonResponse(mailboxTestRes)) as {
          ok?: boolean;
          error?: string;
        };
        setTestResult({ ok: !!mailboxTestData.ok, error: mailboxTestData.error });
        return;
      }

      const res = await fetch(`${getApiBase()}/integrations/health`, { headers: getAuthHeader() });
      const data = (await parseJsonResponse(res)) as {
        ok?: boolean;
        error?: string;
        connections?: { id: string }[];
      };
      if (!data.ok) throw new Error(data.error || "Health check failed");

      const testRes = await fetch(`${getApiBase()}/integrations/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() } as HeadersInit,
        body: JSON.stringify({ integrationId: data.connections?.[0]?.id }),
      });
      const testData = (await parseJsonResponse(testRes)) as { ok?: boolean; error?: string };
      setTestResult({ ok: !!testData.ok, error: testData.error });
    } catch (e) {
      setTestResult({
        ok: false,
        error: formatApiClientError(e, "Connection test failed.", {
          deploymentMessage:
            "The integration test flow reached the wrong server target. Check NEXT_PUBLIC_API_URL and whether the latest API build is deployed.",
        }),
      });
    } finally {
      setLoading(false);
    }
  }

  const stepLabels = ["Choose type", "Connect", "Preferences", "Test"];

  return (
    <div style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Integrations", href: "/dashboard/integrations" }, { label: "Setup" }]}
        title={emailFlowRequested ? "Connect Email" : "Connect to Clio"}
        description={
          emailFlowRequested
            ? "Connect a mailbox for email intake. After a successful connection you will return to Integrations."
            : "Connect Clio first, then configure intake email and review defaults."
        }
      />

      {error && (
        <div
          className="onyx-card"
          style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}
        >
          <p style={{ margin: 0, color: "var(--onyx-error)", fontSize: "0.875rem" }}>{error}</p>
        </div>
      )}

      <div style={{ maxWidth: "32rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
          {([1, 2, 3, 4] as Step[]).map((currentStep) => {
            const disabled = emailFlowRequested && currentStep === 1;
            return (
              <button
                key={currentStep}
                type="button"
                onClick={() => {
                  if (disabled) return;
                  setStep(currentStep);
                }}
                disabled={disabled}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "var(--onyx-radius-md)",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  border: "none",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.55 : 1,
                  ...(step === currentStep
                    ? { background: "var(--onyx-accent)", color: "white" }
                    : { background: "var(--onyx-surface-elevated)", color: "var(--onyx-text-muted)" }),
                }}
              >
                {currentStep}. {stepLabels[currentStep - 1]}
              </button>
            );
          })}
        </div>

        {step === 1 && !emailFlowRequested && (
          <DashboardCard title="Choose connection type">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { value: "email" as const, label: "Email only - Ingest documents from a connected mailbox" },
                { value: "api" as const, label: "Clio only - Connect the case management API" },
                { value: "both" as const, label: "Clio + email - Connect both intake paths" },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "1rem",
                    borderRadius: "var(--onyx-radius-md)",
                    border: "1px solid var(--onyx-border)",
                    cursor: "pointer",
                    background: choice === value ? "var(--onyx-accent-muted)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="choice"
                    checked={choice === value}
                    onChange={() => setChoice(value)}
                    style={{ accentColor: "var(--onyx-accent)" }}
                  />
                  <span style={{ fontSize: "0.875rem" }}>{label}</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => choice && setStep(2)}
              disabled={!choice}
              className="onyx-btn-primary"
              style={{ marginTop: "1rem" }}
            >
              Next
            </button>
          </DashboardCard>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {(choice === "email" || choice === "both") && (
              <DashboardCard title="Email">
                {emailFlowRequested && (
                  <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
                    This is the live mailbox connection flow used by the Integrations page.
                  </p>
                )}
                <div style={fieldGap}>
                  <label style={labelStyle}>Provider</label>
                  <select
                    value={emailProvider ?? ""}
                    onChange={(e) => setEmailProvider((e.target.value as EmailProvider) || null)}
                    className="onyx-input"
                    style={{ width: "100%" }}
                  >
                    <option value="">Select</option>
                    <option value="GMAIL">Gmail</option>
                    <option value="OUTLOOK">Outlook</option>
                    <option value="IMAP">IMAP</option>
                  </select>
                </div>
                <div style={fieldGap}>
                  <label style={labelStyle}>Email address</label>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    className="onyx-input"
                    style={{ width: "100%" }}
                    placeholder="you@firm.com"
                  />
                </div>
                {emailProvider === "IMAP" && (
                  <>
                    <div style={fieldGap}>
                      <label style={labelStyle}>IMAP host</label>
                      <input
                        type="text"
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                        className="onyx-input"
                        style={{ width: "100%" }}
                        placeholder="imap.example.com"
                      />
                    </div>
                    <div style={fieldGap}>
                      <label style={labelStyle}>IMAP port</label>
                      <input
                        type="text"
                        value={imapPort}
                        onChange={(e) => setImapPort(e.target.value)}
                        className="onyx-input"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={fieldGap}>
                      <label style={labelStyle}>IMAP username</label>
                      <input
                        type="text"
                        value={imapUsername}
                        onChange={(e) => setImapUsername(e.target.value)}
                        className="onyx-input"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </>
                )}
                <div style={fieldGap}>
                  <label style={labelStyle}>Password / app password</label>
                  <input
                    type="password"
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    className="onyx-input"
                    style={{ width: "100%" }}
                    placeholder="Never stored in plain text"
                  />
                </div>
                <button
                  type="button"
                  onClick={connectEmail}
                  disabled={loading || !emailAddress || !emailProvider || !imapPassword}
                  className="onyx-btn-primary"
                >
                  {loading ? "Connecting..." : "Connect Email"}
                </button>
              </DashboardCard>
            )}

            {(choice === "api" || choice === "both") && (
              <DashboardCard title="Clio connection">
                <div style={fieldGap}>
                  <label style={labelStyle}>Provider</label>
                  <select
                    value={apiProvider}
                    onChange={(e) => setApiProvider(e.target.value as "CLIO" | "FILEVINE" | "GENERIC")}
                    className="onyx-input"
                    style={{ width: "100%" }}
                  >
                    <option value="CLIO">Clio</option>
                    <option value="FILEVINE">Filevine</option>
                    <option value="GENERIC">Generic API</option>
                  </select>
                </div>
                <div style={fieldGap}>
                  <label style={labelStyle}>API key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="onyx-input"
                    style={{ width: "100%" }}
                    placeholder="Stored encrypted"
                  />
                </div>
                <button
                  type="button"
                  onClick={connectApi}
                  disabled={loading || !apiKey}
                  className="onyx-btn-primary"
                >
                  {loading ? "Connecting..." : "Connect to Clio"}
                </button>
              </DashboardCard>
            )}

            <button
              type="button"
              onClick={() => setStep(1)}
              className="onyx-btn-secondary"
              disabled={emailFlowRequested}
              style={emailFlowRequested ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
            >
              Back
            </button>
          </div>
        )}

        {step === 3 && (
          <DashboardCard title="Workflow preferences">
            <div style={fieldGap}>
              <label style={labelStyle}>Default review queue</label>
              <input
                type="text"
                value={defaultReviewQueue}
                onChange={(e) => setDefaultReviewQueue(e.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
                placeholder="default"
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1rem",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                style={{ accentColor: "var(--onyx-accent)" }}
              />
              <span>Auto-sync documents</span>
            </label>
            <div style={fieldGap}>
              <label style={labelStyle}>Unmatched document handling</label>
              <select
                value={unmatchedHandling}
                onChange={(e) => setUnmatchedHandling(e.target.value)}
                className="onyx-input"
                style={{ width: "100%" }}
              >
                <option value="review_queue">Send to review queue</option>
                <option value="hold">Hold for review</option>
              </select>
            </div>
            <button type="button" onClick={() => setStep(4)} className="onyx-btn-primary">
              Next - Test integration
            </button>
          </DashboardCard>
        )}

        {step === 4 && (
          <DashboardCard title="Test integration">
            <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--onyx-text-muted)" }}>
              Run a connection test and confirm success.
            </p>
            <button
              type="button"
              onClick={runTest}
              disabled={loading}
              className="onyx-btn-primary"
              style={{ marginBottom: "1rem" }}
            >
              {loading ? "Running test..." : "Run connection test"}
            </button>
            {testResult !== null && (
              <div
                className="onyx-card"
                style={{
                  padding: "1rem",
                  marginBottom: "1rem",
                  borderColor: testResult.ok ? "var(--onyx-success)" : "var(--onyx-error)",
                }}
              >
                {testResult.ok ? (
                  <p style={{ margin: 0, fontWeight: 500, color: "var(--onyx-success)" }}>
                    Connection test passed.
                  </p>
                ) : (
                  <p style={{ margin: 0, color: "var(--onyx-error)" }}>
                    Test failed: {testResult.error}
                  </p>
                )}
              </div>
            )}
            <p style={{ margin: "0 0 1rem", fontSize: "0.8125rem", color: "var(--onyx-text-muted)" }}>
              To verify email ingestion: send a test email with a PDF attachment to the connected mailbox; documents
              will appear in the review queue after the next sync.
            </p>
            <Link href="/dashboard/integrations" className="onyx-link" style={{ fontSize: "0.875rem" }}>
              Back to Integrations -&gt;
            </Link>
          </DashboardCard>
        )}
      </div>
    </div>
  );
}
