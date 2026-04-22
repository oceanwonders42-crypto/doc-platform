"use client";

import Link from "next/link";
import type { ExtractionResult } from "@/lib/demo-extraction";

type DocumentResultPanelProps = {
  fileName: string;
  result: ExtractionResult;
};

function formatDate(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function confidenceLabel(confidence: number) {
  if (confidence >= 0.9) return { text: "High confidence", class: "text-[#14B8A6]" };
  if (confidence >= 0.75) return { text: "Medium confidence", class: "text-amber-400" };
  return { text: "Low confidence", class: "text-amber-500" };
}

export default function DocumentResultPanel({ fileName, result }: DocumentResultPanelProps) {
  const conf = confidenceLabel(result.confidence);
  const confidencePct = Math.round(result.confidence * 100);

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[#B3B6BA]">Document</h2>
        <p className="mt-2 font-medium text-[#FFFFFF] break-all">{fileName}</p>
        <p className="mt-1 text-sm text-[#B3B6BA]">Detected type: {result.documentType}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[#B3B6BA]">Provider</h2>
          <p className="mt-2 text-lg font-medium text-[#FFFFFF]">{result.providerName}</p>
        </div>
        <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[#B3B6BA]">Date range</h2>
          <p className="mt-2 text-[#FFFFFF]">
            {formatDate(result.dateRange.from)} – {formatDate(result.dateRange.to)}
          </p>
        </div>
      </div>

      {result.billingAmount != null && (
        <div className="rounded-xl border border-[#14B8A6]/30 bg-[#14B8A6]/10 p-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-[#B3B6BA]">Billing extracted</h2>
          <p className="mt-2 text-2xl font-bold text-[#14B8A6]">{formatCurrency(result.billingAmount)}</p>
        </div>
      )}

      <div className="rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[#B3B6BA]">Timeline entries</h2>
        <ul className="mt-4 space-y-2">
          {result.timelineEntries.map((e, i) => (
            <li key={i} className="flex items-baseline gap-3 text-sm">
              <span className="shrink-0 font-mono text-xs text-[#3B82F6]">{e.date}</span>
              <span className="text-[#FFFFFF]">{e.event}</span>
              {e.provider && <span className="text-[#B3B6BA]">— {e.provider}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-6">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-[#B3B6BA]">Confidence</h2>
          <p className={`mt-1 font-medium ${conf.class}`}>{conf.text}</p>
          <p className="text-xs text-[#B3B6BA]">{confidencePct}%</p>
        </div>
        {result.needsReview && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/20 px-3 py-2">
            <span className="text-amber-400 font-medium">Review recommended</span>
            <span className="text-xs text-amber-400/80">— verify dates and provider</span>
          </div>
        )}
      </div>

      <div className="pt-4">
        <Link
          href="/dashboard/upload"
          className="rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Upload another document
        </Link>
        <Link
          href="/dashboard"
          className="ml-3 rounded-lg border border-[#2A2C2E] px-5 py-2.5 text-sm font-medium text-[#B3B6BA] hover:bg-[#181A1B] hover:text-[#FFFFFF] transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
