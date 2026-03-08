"use strict";
/**
 * CRM adapter destination: push a case packet ready note to the firm's CRM (no file upload).
 * Uses existing pushCaseUpdate / CrmPushLog. New CRM adapters plug into the same push path.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmDestination = void 0;
const pushService_1 = require("../../../integrations/crm/pushService");
exports.crmDestination = {
    kind: "crm",
    async export(bundle) {
        const title = "Case packet ready for export";
        const caseLabel = [bundle.case.caseNumber, bundle.case.clientName, bundle.case.title].filter(Boolean).join(" — ") || bundle.caseId;
        const bodyMarkdown = [
            `**Case:** ${caseLabel}`,
            `**Documents:** ${bundle.documents.length} file(s)`,
            bundle.summaryText ? `**Summary:** ${bundle.summaryText.slice(0, 500)}${bundle.summaryText.length > 500 ? "…" : ""}` : "",
        ]
            .filter(Boolean)
            .join("\n\n");
        const result = await (0, pushService_1.pushCrmWebhook)({
            firmId: bundle.firmId,
            caseId: bundle.caseId,
            title,
            bodyMarkdown,
            meta: { actionType: "export_packet_ready", documentCount: bundle.documents.length },
        });
        if (result.ok) {
            return { ok: true, kind: "crm" };
        }
        return { ok: false, kind: "crm", error: result.error };
    },
};
