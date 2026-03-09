"use client";

import { useState } from "react";

const inputBase =
  "mt-2 block w-full rounded-lg border px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-1";
const inputValid = "border-zinc-700 bg-zinc-800/50 focus:border-blue-500 focus:ring-blue-500";
const inputError = "border-red-500/70 bg-zinc-800/50 focus:border-red-500 focus:ring-red-500";

function inputClass(hasError: boolean) {
  return `${inputBase} ${hasError ? inputError : inputValid}`;
}

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
      website: formData.get("website"), // honeypot
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

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
      <section id="demo" className="relative border-t border-zinc-800/50 bg-[#0d0d0d] py-24 md:py-32">
        <div className="mx-auto max-w-2xl px-6 text-center lg:px-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-12">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <svg
                className="h-8 w-8 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-2xl font-semibold text-white">
              Request received
            </h3>
            <p className="mt-3 text-zinc-400">
              Our team will reach out within 24 hours to schedule your demo.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="demo" className="relative border-t border-zinc-800/50 bg-[#0d0d0d] py-24 md:py-32">
      <div className="mx-auto max-w-2xl px-6 lg:px-8">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 md:p-12">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Request a demo
            </h2>
            <p className="mt-3 text-zinc-400">
              See how Onyx Intel can transform your firm. No commitment required.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Your information is secure. We never share or sell your data.
            </p>
          </div>
          <form
            onSubmit={handleSubmit}
            className="mt-10 space-y-6"
          >
            {/* Honeypot - hidden from users, bots will fill it */}
            <div
              className="absolute -left-[9999px] opacity-0"
              aria-hidden="true"
            >
              <label htmlFor="website">Website</label>
              <input
                type="text"
                name="website"
                id="website"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="firstName"
                  className="block text-sm font-medium text-zinc-300"
                >
                  First name
                </label>
                <input
                  type="text"
                  name="firstName"
                  id="firstName"
                  required
                  className={inputClass(!!fieldErrors.firstName)}
                  placeholder="John"
                />
              </div>
              <div>
                <label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-zinc-300"
                >
                  Last name
                </label>
                <input
                  type="text"
                  name="lastName"
                  id="lastName"
                  required
                  className={inputClass(!!fieldErrors.lastName)}
                  placeholder="Smith"
                />
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-zinc-300"
                >
                  Work email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  className={inputClass(!!fieldErrors.email)}
                  placeholder="john@lawfirm.com"
                />
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-zinc-300"
                >
                  Phone number
                </label>
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  required
                  className={inputClass(!!fieldErrors.phone)}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="firm"
                  className="block text-sm font-medium text-zinc-300"
                >
                  Firm name
                </label>
                <input
                  type="text"
                  name="firm"
                  id="firm"
                  required
                  className={inputClass(!!fieldErrors.firm)}
                  placeholder="Smith & Associates"
                />
              </div>
              <div>
                <label
                  htmlFor="cms"
                  className="block text-sm font-medium text-zinc-300"
                >
                  Case management system
                </label>
                <select
                  name="cms"
                  id="cms"
                  className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select one</option>
                  <option value="clio">Clio</option>
                  <option value="filevine">FileVine</option>
                  <option value="smokeball">Smokeball</option>
                  <option value="mycase">MyCase</option>
                  <option value="practicepanther">PracticePanther</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label
                htmlFor="firmSize"
                className="block text-sm font-medium text-zinc-300"
              >
                Firm size
              </label>
              <select
                name="firmSize"
                id="firmSize"
                className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select one</option>
                <option value="1-5">1–5 attorneys</option>
                <option value="6-15">6–15 attorneys</option>
                <option value="16-50">16–50 attorneys</option>
                <option value="50+">50+ attorneys</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-zinc-300"
              >
                Biggest workflow challenge
              </label>
              <textarea
                name="message"
                id="message"
                rows={3}
                className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="What's your biggest challenge with medical records? (e.g., organizing records, timeline creation, billing extraction)"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3.5 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
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
                  "Request demo"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
