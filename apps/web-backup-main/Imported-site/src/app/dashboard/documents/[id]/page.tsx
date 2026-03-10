"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import DocumentResultPanel from "@/components/dashboard/DocumentResultPanel";
import { getStoredResult } from "@/lib/demo-extraction";

type StoredPayload = { fileName: string; result: import("@/lib/demo-extraction").ExtractionResult };

export default function DocumentResultPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : null;
  const [payload, setPayload] = useState<StoredPayload | null | "loading">("loading");

  useEffect(() => {
    if (!id) {
      setPayload(null);
      return;
    }
    // Result read from sessionStorage (demo); replace with API fetch when backend exists.
    const data = getStoredResult(id);
    setPayload(data);
  }, [id]);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#0B0B0C] pt-16">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="text-sm text-[#B3B6BA] hover:text-[#3B82F6] transition-colors"
          >
            ← Dashboard
          </Link>

          {payload === "loading" && (
            <div className="mt-8 flex flex-col items-center gap-4 py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3B82F6] border-t-transparent" />
              <p className="text-sm text-[#B3B6BA]">Loading result…</p>
            </div>
          )}

          {payload === null && (
            <div className="mt-8 rounded-xl border border-[#2A2C2E] bg-[#181A1B] p-8 text-center">
              <h1 className="text-xl font-semibold text-[#FFFFFF]">Result not found</h1>
              <p className="mt-2 text-sm text-[#B3B6BA]">
                This result may have expired or the link is invalid. Upload a document to see extraction results.
              </p>
              <Link
                href="/dashboard/upload"
                className="mt-6 inline-block rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                Upload document
              </Link>
            </div>
          )}

          {payload && payload !== "loading" && (
            <>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#FFFFFF] sm:text-3xl">
                Extraction result
              </h1>
              <p className="mt-1 text-sm text-[#B3B6BA]">
                Summary of what we extracted from your document.
              </p>
              <div className="mt-8">
                <DocumentResultPanel fileName={payload.fileName} result={payload.result} />
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
