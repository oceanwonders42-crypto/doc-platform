"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { runMockExtraction, setStoredResult } from "@/lib/demo-extraction";

const PROCESSING_STEPS = [
  "Uploading document…",
  "Detecting document type…",
  "Extracting provider and dates…",
  "Parsing billing and timeline…",
  "Complete",
];

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) {
      setFile(f);
      setErrorMessage(null);
    } else if (f) {
      setErrorMessage("Please upload a PDF file.");
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setErrorMessage(null);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file) {
      setErrorMessage("Select a PDF to continue.");
      return;
    }
    setStatus("processing");
    setErrorMessage(null);
    setStepIndex(0);

    const stepDuration = 600;
    for (let i = 0; i < PROCESSING_STEPS.length; i++) {
      setStepIndex(i);
      await new Promise((r) => setTimeout(r, stepDuration));
    }

    try {
      // Mock extraction pipeline; replace with API call when backend is ready.
      const result = runMockExtraction(file.name);
      const jobId = `demo-${Date.now()}`;
      setStoredResult(jobId, { fileName: file.name, result });
      setStatus("done");
      window.location.href = `/dashboard/documents/${jobId}`;
    } catch {
      setStatus("error");
      setErrorMessage("Processing failed. Please try again.");
    }
  }, [file]);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0B0B0C] pt-16">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="text-sm text-[#B3B6BA] hover:text-[#3B82F6] transition-colors"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#FFFFFF] sm:text-3xl">
            Upload document
          </h1>
          <p className="mt-1 text-sm text-[#B3B6BA]">
            Upload a medical or billing record. We’ll detect type, provider, dates, and extract billing when available.
          </p>

          {status === "idle" && (
            <>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`mt-8 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                  dragActive ? "border-[#3B82F6] bg-[#3B82F6]/10" : "border-[#2A2C2E] bg-[#181A1B] hover:border-[#2A2C2E]/80"
                }`}
              >
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleChange}
                  className="sr-only"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <svg
                    className="mx-auto h-12 w-12 text-[#B3B6BA]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-[#FFFFFF]">
                    {file ? file.name : "Drop your PDF here or click to browse"}
                  </p>
                  <p className="mt-1 text-xs text-[#B3B6BA]">PDF only, max 50MB</p>
                </label>
              </div>
              {errorMessage && (
                <p className="mt-3 text-sm text-amber-400" role="alert">
                  {errorMessage}
                </p>
              )}
              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!file}
                  className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Process document
                </button>
                <Link
                  href="/dashboard"
                  className="rounded-lg border border-[#2A2C2E] px-5 py-2.5 text-sm font-medium text-[#B3B6BA] hover:bg-[#181A1B] hover:text-[#FFFFFF] transition-colors"
                >
                  Cancel
                </Link>
              </div>
            </>
          )}

          {status === "processing" && (
            <div className="mt-8 rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-8">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-full border-2 border-[#3B82F6] border-t-transparent animate-spin" />
                <div>
                  <p className="font-medium text-[#FFFFFF]">Processing…</p>
                  <p className="text-sm text-[#B3B6BA]">{PROCESSING_STEPS[stepIndex]}</p>
                </div>
              </div>
              <ul className="mt-6 space-y-2">
                {PROCESSING_STEPS.map((step, i) => (
                  <li
                    key={step}
                    className={`flex items-center gap-2 text-sm ${
                      i <= stepIndex ? "text-[#FFFFFF]" : "text-[#B3B6BA]/60"
                    }`}
                  >
                    {i < stepIndex ? (
                      <span className="text-[#14B8A6]">✓</span>
                    ) : i === stepIndex ? (
                      <span className="h-4 w-4 animate-pulse rounded-full bg-[#3B82F6]" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-[#2A2C2E]" />
                    )}
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {status === "error" && (
            <div className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6">
              <p className="font-medium text-amber-400">Something went wrong</p>
              <p className="mt-1 text-sm text-[#B3B6BA]">{errorMessage}</p>
              <button
                type="button"
                onClick={() => { setStatus("idle"); setErrorMessage(null); }}
                className="mt-4 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
