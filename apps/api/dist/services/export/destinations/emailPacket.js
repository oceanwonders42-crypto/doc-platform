"use strict";
/**
 * Email packet destination: build ZIP and send as email attachment.
 * Uses shared send adapter (SMTP). Options: emailTo (required), emailSubject.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailPacketDestination = void 0;
const casePacketExport_1 = require("../../casePacketExport");
const compositeAdapter_1 = require("../../../send/compositeAdapter");
exports.emailPacketDestination = {
    kind: "email_packet",
    async export(bundle, options) {
        const to = options?.emailTo?.trim();
        if (!to) {
            return { ok: false, kind: "email_packet", error: "emailTo is required for email_packet destination" };
        }
        try {
            const zipBuffer = await (0, casePacketExport_1.buildCasePacketZipFromBundle)(bundle);
            const ts = bundle.exportedAt.slice(0, 10);
            const caseLabel = [bundle.case.caseNumber, bundle.case.clientName].filter(Boolean).join(" — ") || bundle.caseId;
            const subject = options?.emailSubject?.trim() || `Case packet: ${caseLabel} (${ts})`;
            const body = `Case packet export for ${caseLabel}.\n\nDocuments: ${bundle.documents.length} file(s).\nExported at ${bundle.exportedAt}.`;
            const result = await compositeAdapter_1.sendAdapter.sendEmail(to, subject, body, [
                { filename: `case-packet-${ts}.zip`, content: zipBuffer, contentType: "application/zip" },
            ]);
            if (result.ok) {
                return { ok: true, kind: "email_packet" };
            }
            return { ok: false, kind: "email_packet", error: result.error };
        }
        catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { ok: false, kind: "email_packet", error };
        }
    },
};
