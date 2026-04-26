"use client";

import { useState } from "react";

const firmSizes = ["Solo", "2-5", "6-15", "16-50", "51+"];
const roles = ["Firm owner/admin", "Attorney", "Paralegal/assistant", "Operations", "Other"];
const improvementOptions = [
  "Email PDF ingestion",
  "Document review/OCR",
  "Case routing",
  "Chronologies",
  "Missing records",
  "Bills vs treatment",
  "Demand drafting",
  "Clio writeback",
  "All of the above",
];

type DemoResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  requestId?: string;
  fieldErrors?: Record<string, string>;
};

function fieldClass(hasError: boolean) {
  return [
    "mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm text-[#111111] outline-none transition",
    hasError ? "border-red-300 ring-2 ring-red-100" : "border-[#d1d5db] focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]",
  ].join(" ");
}

export default function DemoRequestForm() {
  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [firmName, setFirmName] = useState("");
  const [firmSize, setFirmSize] = useState("");
  const [role, setRole] = useState("");
  const [improvements, setImprovements] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<DemoResponse | null>(null);

  function toggleImprovement(option: string) {
    setImprovements((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option]
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const response = await fetch("/api/demo/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          workEmail,
          firmName,
          firmSize,
          role,
          improvements,
          message,
          pageUrl: typeof window !== "undefined" ? window.location.href : "https://onyxintels.com/demo",
        }),
      });
      const data = (await response.json().catch(() => ({
        ok: false,
        error: "The demo request endpoint returned an invalid response.",
      }))) as DemoResponse;

      if (response.ok && data.ok) {
        setSuccess(data);
        setFullName("");
        setWorkEmail("");
        setFirmName("");
        setFirmSize("");
        setRole("");
        setImprovements([]);
        setMessage("");
        return;
      }

      setFieldErrors(data.fieldErrors ?? {});
      setError(data.error ?? "Unable to submit demo request right now.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to submit demo request right now.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-[2rem] border border-[#bfdbfe] bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Request received</p>
        <h2 className="mt-4 text-3xl font-black tracking-[-0.055em] text-[#0a0a0a]">
          Thanks - we&apos;ll reach out to schedule your walkthrough.
        </h2>
        <p className="mt-4 text-sm leading-6 text-[#525252]">
          We saved your request and will tailor the walkthrough to the workflows you selected.
        </p>
        <p className="mt-6 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4 text-xs font-bold text-[#6b7280]">
          Confirmation ID: {success.requestId}
        </p>
        <button
          type="button"
          onClick={() => setSuccess(null)}
          className="mt-6 rounded-full border border-[#d1d5db] bg-white px-5 py-3 text-sm font-black text-[#111111] transition hover:border-[#2563eb] hover:text-[#2563eb]"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[2rem] border border-[#e5e7eb] bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:p-8">
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2563eb]">Demo request</p>
        <h2 className="mt-3 text-3xl font-black tracking-[-0.055em] text-[#0a0a0a]">Tell us about your workflow.</h2>
        <p className="mt-3 text-sm leading-6 text-[#525252]">No credit card. Just a focused walkthrough tailored to your firm.</p>
      </div>

      {error ? (
        <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold text-[#111111]">
          Full name
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} className={fieldClass(Boolean(fieldErrors.fullName))} autoComplete="name" />
          {fieldErrors.fullName ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.fullName}</span> : null}
        </label>

        <label className="text-sm font-bold text-[#111111]">
          Work email
          <input type="email" value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} className={fieldClass(Boolean(fieldErrors.workEmail))} autoComplete="email" />
          {fieldErrors.workEmail ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.workEmail}</span> : null}
        </label>

        <label className="text-sm font-bold text-[#111111]">
          Firm name
          <input value={firmName} onChange={(event) => setFirmName(event.target.value)} className={fieldClass(Boolean(fieldErrors.firmName))} autoComplete="organization" />
          {fieldErrors.firmName ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.firmName}</span> : null}
        </label>

        <label className="text-sm font-bold text-[#111111]">
          Firm size
          <select value={firmSize} onChange={(event) => setFirmSize(event.target.value)} className={fieldClass(Boolean(fieldErrors.firmSize))}>
            <option value="">Select size</option>
            {firmSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          {fieldErrors.firmSize ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.firmSize}</span> : null}
        </label>
      </div>

      <label className="mt-4 block text-sm font-bold text-[#111111]">
        Role
        <select value={role} onChange={(event) => setRole(event.target.value)} className={fieldClass(Boolean(fieldErrors.role))}>
          <option value="">Select role</option>
          {roles.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        {fieldErrors.role ? <span className="mt-1 block text-xs text-red-600">{fieldErrors.role}</span> : null}
      </label>

      <fieldset className="mt-5">
        <legend className="text-sm font-bold text-[#111111]">What do you want to improve?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {improvementOptions.map((option) => (
            <label key={option} className="flex items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-3 text-sm font-semibold text-[#525252]">
              <input
                type="checkbox"
                checked={improvements.includes(option)}
                onChange={() => toggleImprovement(option)}
                className="h-4 w-4 accent-[#2563eb]"
              />
              {option}
            </label>
          ))}
        </div>
        {fieldErrors.improvements ? <span className="mt-2 block text-xs text-red-600">{fieldErrors.improvements}</span> : null}
      </fieldset>

      <label className="mt-5 block text-sm font-bold text-[#111111]">
        Optional message
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          className={fieldClass(false)}
          placeholder="Tell us about your current document workflow."
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-full bg-[#0a0a0a] px-6 py-3 text-sm font-black text-white transition hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Submitting..." : "Request demo"}
      </button>
    </form>
  );
}
