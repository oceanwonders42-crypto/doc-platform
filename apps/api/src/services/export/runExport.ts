/**
 * Run export: build bundle once, then run one or more destinations.
 * Keeps export tied to existing case/document data; no changes to ingestion/OCR/classification/case-match.
 */

import type { ExportDestinationKind } from "./destinations/types";
import type { ExportDestinationOptions } from "./destinations/types";
import type { ExportResult } from "./destinations/types";
import { buildExportBundle } from "./contract";
import { getExportDestination } from "./destinations";

export type RunExportParams = {
  caseId: string;
  firmId: string;
  /** Default ["download_bundle"] for backward compatibility */
  destinations: ExportDestinationKind[];
  documentIds?: string[];
  includeTimeline?: boolean;
  includeSummary?: boolean;
  /** records | bills | combined. Default combined. */
  packetType?: "records" | "bills" | "combined";
  /** Passed to destinations (e.g. emailTo for email_packet) */
  options?: ExportDestinationOptions;
};

export type RunExportResult = {
  ok: boolean;
  bundle: { caseId: string; documentCount: number } | null;
  results: ExportResult[];
  error?: string;
};

/**
 * Build the shared export bundle and run each requested destination.
 * Use after document processing is complete (documents routed to case).
 */
export async function runExport(params: RunExportParams): Promise<RunExportResult> {
  const {
    caseId,
    firmId,
    destinations,
    documentIds,
    includeTimeline = true,
    includeSummary = false,
    packetType = "combined",
    options = {},
  } = params;

  const kinds = destinations.length > 0 ? destinations : (["download_bundle"] as ExportDestinationKind[]);

  const bundle = await buildExportBundle(caseId, firmId, {
    documentIds,
    includeTimeline,
    includeSummary,
    packetType,
  });

  if (!bundle) {
    return {
      ok: false,
      bundle: null,
      results: [],
      error: "Case not found",
    };
  }

  const results: ExportResult[] = [];
  for (const kind of kinds) {
    try {
      const dest = getExportDestination(kind);
      const result = await dest.export(bundle, { ...options, packetType });
      results.push(result);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      results.push({ ok: false, kind, error });
    }
  }

  const ok = results.every((r) => r.ok);
  return {
    ok,
    bundle: { caseId: bundle.caseId, documentCount: bundle.documents.length },
    results,
    error: ok ? undefined : results.find((r) => !r.ok)?.error,
  };
}
