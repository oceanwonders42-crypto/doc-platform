"use strict";
/**
 * CRM adapter interface and routing layer.
 * Supported systems (scaffold): Clio, Litify, Generic webhook.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.noopRouteToCrm = exports.genericWebhookAdapter = exports.litifyAdapter = exports.clioAdapter = void 0;
exports.routeDocumentToCrm = routeDocumentToCrm;
const prisma_1 = require("../db/prisma");
/** Clio scaffold — not implemented. */
const clioAdapter = async (opts) => {
    console.log("[crm] Clio route (scaffold):", opts.documentId, opts.caseId);
    return { ok: false, error: "Clio adapter not implemented" };
};
exports.clioAdapter = clioAdapter;
/** Litify scaffold — not implemented. */
const litifyAdapter = async (opts) => {
    console.log("[crm] Litify route (scaffold):", opts.documentId, opts.caseId);
    return { ok: false, error: "Litify adapter not implemented" };
};
exports.litifyAdapter = litifyAdapter;
/** Generic webhook scaffold — POST to config.webhook_url with document payload. */
const genericWebhookAdapter = async (opts) => {
    const url = opts.config?.webhook_url;
    if (!url)
        return { ok: false, error: "Generic webhook requires config.webhook_url" };
    try {
        const folderPath = opts.suggestedFolder
            ? `case/${opts.caseId}/${opts.suggestedFolder}/`
            : `case/${opts.caseId}/`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                documentId: opts.documentId,
                caseId: opts.caseId,
                system: opts.system,
                folder: opts.suggestedFolder ?? undefined,
                folderPath,
            }),
        });
        if (!res.ok) {
            return { ok: false, error: `Webhook ${res.status}: ${await res.text()}` };
        }
        return { ok: true };
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
    }
};
exports.genericWebhookAdapter = genericWebhookAdapter;
function getAdapter(system) {
    switch (system) {
        case "clio":
            return exports.clioAdapter;
        case "litify":
            return exports.litifyAdapter;
        case "generic":
            return exports.genericWebhookAdapter;
        default:
            return () => Promise.resolve({ ok: false, error: `Unknown CRM system: ${system}` });
    }
}
/**
 * Route a document to a CRM. Updates Document.routedSystem, routedCaseId, routingStatus.
 * When suggestedFolder is set, upload path is case/suggestedFolder/.
 */
async function routeDocumentToCrm(documentId, system, caseId, config) {
    const doc = await prisma_1.prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, firmId: true, extractedFields: true },
    });
    if (!doc) {
        return { ok: false, error: "Document not found" };
    }
    const adapter = getAdapter(system);
    const suggestedFolder = doc.extractedFields != null && typeof doc.extractedFields === "object" && "folder" in doc.extractedFields
        ? doc.extractedFields.folder ?? undefined
        : undefined;
    const result = await adapter({
        documentId,
        system,
        caseId,
        config,
        suggestedFolder,
    });
    if (result.ok) {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: {
                routedSystem: system,
                routedCaseId: caseId,
                routingStatus: "sent",
            },
        });
    }
    else {
        await prisma_1.prisma.document.update({
            where: { id: documentId },
            data: { routingStatus: "failed" },
        });
    }
    return result;
}
const noopRouteToCrm = async () => {
    return { ok: false, error: "CRM adapter not implemented" };
};
exports.noopRouteToCrm = noopRouteToCrm;
