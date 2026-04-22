"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getApiBase, getAuthHeader, parseJsonResponse } from "@/lib/api";
import { getErrorMessage, getUserMessage, isApiError } from "@/lib/errors";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DashboardCard } from "@/components/dashboard/DashboardCard";

function BackArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function SupportReportPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location?.href) setPageUrl((u) => (u ? u : window.location.href));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/support/bug-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          pageUrl: pageUrl.trim() || null,
          screenshotUrl: screenshotUrl.trim() || null,
        }),
      });
      const data = (await parseJsonResponse(res)) as { ok?: boolean; error?: string; code?: string };
      if (res.ok && data.ok) {
        setSubmitted(true);
        setTitle("");
        setDescription("");
        setPageUrl("");
        setScreenshotUrl("");
        return;
      }
      const serverMsg = (isApiError(data) ? data.error : data?.error) || res.statusText || "Submission failed";
      const code = isApiError(data) ? data.code : undefined;
      setError(getUserMessage(code, serverMsg));
    } catch (e) {
      setError(getErrorMessage(e, "Request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="dashboard-content-narrow" style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
        <PageHeader breadcrumbs={[{ label: "Support" }, { label: "Report a problem" }]} title="Report a problem" size="large" />
        <div className="onyx-card support-report-card">
          <p style={{ margin: "0 0 1.25rem", fontSize: "var(--onyx-dash-font-base)", color: "var(--onyx-success)" }}>
            Thank you. Your report has been submitted and we&apos;ll look into it.
          </p>
          <Link href="/dashboard" className="dashboard-back-link">
            <BackArrowIcon />
            <span>Back to dashboard</span>
          </Link>
          <span style={{ marginLeft: "0.75rem" }}>
            <Link href="/dashboard/support/report" className="onyx-link" style={{ fontSize: "var(--onyx-dash-font-sm)" }}>
              Submit another report
            </Link>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-content-narrow" style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <PageHeader
        breadcrumbs={[{ label: "Support" }, { label: "Report a problem" }]}
        title="Report a problem"
        description="Describe the issue you ran into. Your firm context is sent automatically; do not include sensitive data."
        size="large"
      />

      {error && (
        <div
          role="alert"
          className="onyx-card"
          style={{ padding: "1.25rem", marginBottom: "1.25rem", borderColor: "var(--onyx-error)", fontSize: "var(--onyx-dash-font-base)" }}
        >
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
        </div>
      )}

      <DashboardCard title="Submit a report" className="support-report-card">
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          <div className="support-report-field">
            <label htmlFor="support-title" className="support-report-label">
              Title *
            </label>
            <input
              id="support-title"
              type="text"
              required
              maxLength={500}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary of the issue"
              className="onyx-input"
              style={{ width: "100%" }}
            />
          </div>
          <div className="support-report-field">
            <label htmlFor="support-description" className="support-report-label">
              Description *
            </label>
            <textarea
              id="support-description"
              required
              maxLength={10000}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? Steps to reproduce?"
              className="onyx-input"
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div className="support-report-field">
            <label htmlFor="support-pageUrl" className="support-report-label">
              Page URL
            </label>
            <input
              id="support-pageUrl"
              type="url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://..."
              className="onyx-input"
              style={{ width: "100%" }}
            />
          </div>
          <div className="support-report-field">
            <label htmlFor="support-screenshotUrl" className="support-report-label">
              Screenshot URL (optional)
            </label>
            <input
              id="support-screenshotUrl"
              type="url"
              value={screenshotUrl}
              onChange={(e) => setScreenshotUrl(e.target.value)}
              placeholder="https://..."
              className="onyx-input"
              style={{ width: "100%" }}
            />
          </div>
          <button type="submit" disabled={submitting} className="onyx-btn-primary">
            {submitting ? "Sending…" : "Submit"}
          </button>
        </form>
      </DashboardCard>

      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/dashboard" className="dashboard-back-link">
          <BackArrowIcon />
          <span>Back to dashboard</span>
        </Link>
      </p>
    </div>
  );
}
