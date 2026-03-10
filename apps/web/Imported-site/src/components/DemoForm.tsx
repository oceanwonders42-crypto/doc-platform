"use client";

import { useState } from "react";

const inputClass =
  "input-base";
const inputErrorClass =
  "input-base input-error";

export default function DemoForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const payload = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      firm: formData.get("firm"),
      cms: formData.get("cms") || undefined,
      firmSize: formData.get("firmSize") || undefined,
      message: formData.get("message") || undefined,
      website: formData.get("website"),
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: { success?: boolean; error?: string; fields?: string[] };
      try {
        data = await res.json();
      } catch {
        setError("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        if (data.fields && Array.isArray(data.fields)) {
          const errs: Record<string, boolean> = {};
          data.fields.forEach((f: string) => {
            errs[f] = true;
          });
          setFieldErrors(errs);
        }
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <section id="demo" className="border-t border-[var(--border-default)] bg-[var(--bg-primary)] py-24 md:py-32">
        <div className="mx-auto max-w-xl px-5 text-center sm:px-6 lg:px-8">
          <div className="card p-10 md:p-12">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-teal)]/15">
              <svg
                className="h-8 w-8 text-[var(--accent-teal)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">
              Request received
            </h3>
            <p className="mt-3 text-[var(--text-secondary)]">
              Our team will reach out within 24 hours to schedule your demo.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="demo" className="border-t border-[var(--border-default)] bg-[var(--bg-primary)] py-20 md:py-28">
      <div className="mx-auto max-w-xl px-5 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
          Trusted by law firms · HIPAA-ready · BAA available
        </p>
        <div className="card mt-8 p-8 md:p-10">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              Book a 15‑min demo
            </h2>
            <p className="mt-3 text-[var(--text-secondary)]">
              We’ll show you the dashboard, upload flow, and how sync works with your CMS.
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              No commitment. Your information is secure—we never share or sell your data.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
            <div className="absolute -left-[9999px] opacity-0" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input type="text" name="website" id="website" tabIndex={-1} autoComplete="off" />
            </div>

            {error && (
              <div className="rounded-[var(--radius-md)] border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-[var(--text-secondary)]">
                  First name
                </label>
                <input
                  type="text"
                  name="firstName"
                  id="firstName"
                  required
                  className={fieldErrors.firstName ? inputErrorClass : inputClass}
                  placeholder="John"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-[var(--text-secondary)]">
                  Last name
                </label>
                <input
                  type="text"
                  name="lastName"
                  id="lastName"
                  required
                  className={fieldErrors.lastName ? inputErrorClass : inputClass}
                  placeholder="Smith"
                />
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[var(--text-secondary)]">
                  Work email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  className={fieldErrors.email ? inputErrorClass : inputClass}
                  placeholder="john@lawfirm.com"
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-[var(--text-secondary)]">
                  Phone number
                </label>
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  required
                  className={fieldErrors.phone ? inputErrorClass : inputClass}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="firm" className="block text-sm font-medium text-[var(--text-secondary)]">
                  Firm name
                </label>
                <input
                  type="text"
                  name="firm"
                  id="firm"
                  required
                  className={fieldErrors.firm ? inputErrorClass : inputClass}
                  placeholder="Smith & Associates"
                />
              </div>
              <div>
                <label htmlFor="cms" className="block text-sm font-medium text-[var(--text-secondary)]">
                  Case management system
                </label>
                <select name="cms" id="cms" className={inputClass}>
                  <option value="">Select one</option>
                  <option value="clio">Clio</option>
                  <option value="filevine">FileVine</option>
                  <option value="litify">Litify</option>
                  <option value="mycase">MyCase</option>
                  <option value="practicepanther">PracticePanther</option>
                  <option value="smokeball">Smokeball</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="firmSize" className="block text-sm font-medium text-[var(--text-secondary)]">
                Firm size
              </label>
              <select name="firmSize" id="firmSize" className={inputClass}>
                <option value="">Select one</option>
                <option value="1-5">1–5 attorneys</option>
                <option value="6-15">6–15 attorneys</option>
                <option value="16-50">16–50 attorneys</option>
                <option value="50+">50+ attorneys</option>
              </select>
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-[var(--text-secondary)]">
                Biggest workflow challenge
              </label>
              <textarea
                name="message"
                id="message"
                rows={3}
                className={inputClass}
                placeholder="e.g., organizing records, timeline creation, billing extraction"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex w-full items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="h-5 w-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Submitting...
                </span>
              ) : (
                "Book a demo"
              )}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
