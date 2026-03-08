"use strict";
/**
 * Run export: build bundle once, then run one or more destinations.
 * Keeps export tied to existing case/document data; no changes to ingestion/OCR/classification/case-match.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExport = runExport;
const contract_1 = require("./contract");
const destinations_1 = require("./destinations");
/**
 * Build the shared export bundle and run each requested destination.
 * Use after document processing is complete (documents routed to case).
 */
async function runExport(params) {
    const { caseId, firmId, destinations, documentIds, includeTimeline = true, includeSummary = false, options = {}, } = params;
    const kinds = destinations.length > 0 ? destinations : ["download_bundle"];
    const bundle = await (0, contract_1.buildExportBundle)(caseId, firmId, {
        documentIds,
        includeTimeline,
        includeSummary,
    });
    if (!bundle) {
        return {
            ok: false,
            bundle: null,
            results: [],
            error: "Case not found",
        };
    }
    const results = [];
    for (const kind of kinds) {
        try {
            const dest = (0, destinations_1.getExportDestination)(kind);
            const result = await dest.export(bundle, options);
            results.push(result);
        }
        catch (e) {
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
