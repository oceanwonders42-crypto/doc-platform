"use strict";
/**
 * CRM case sync adapter: read cases from external CRMs and push updates back.
 * Does NOT store full case records locally—only caseId, externalMatterId, firmId (CrmCaseMapping).
 *
 * Supported providers: clio, litify, filevine, generic_webhook.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCasesFromCRM = fetchCasesFromCRM;
exports.pushCaseUpdate = pushCaseUpdate;
exports.upsertCrmCaseMapping = upsertCrmCaseMapping;
exports.getCrmCaseMapping = getCrmCaseMapping;
const prisma_1 = require("../../db/prisma");
const webhookAdapter_1 = __importDefault(require("./webhookAdapter"));
const CLIO_API_BASE = process.env.CLIO_API_BASE_URL || "https://app.clio.com/api/v4";
async function getFirmCrmSettings(firmId) {
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { settings: true },
    });
    const settings = firm?.settings ?? {};
    const provider = (settings.crmProvider ?? settings.crm ?? "generic_webhook");
    const valid = ["clio", "litify", "filevine", "generic_webhook"];
    return {
        provider: valid.includes(provider) ? provider : "generic_webhook",
        settings,
    };
}
/** Fetch matters/cases from the firm's configured CRM. Returns minimal refs only; no full records stored. */
async function fetchCasesFromCRM(firmId) {
    const { provider, settings } = await getFirmCrmSettings(firmId);
    if (provider === "clio") {
        const token = settings.clioAccessToken;
        if (!token || typeof token !== "string") {
            return { ok: false, error: "Clio access token not configured" };
        }
        try {
            const res = await fetch(`${CLIO_API_BASE}/matters?limit=100`, {
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            if (!res.ok) {
                const text = await res.text();
                return { ok: false, error: `Clio API ${res.status}: ${text.slice(0, 200)}` };
            }
            const data = (await res.json());
            const matters = data?.data ?? [];
            const cases = matters.map((m) => ({
                externalMatterId: String(m.id ?? ""),
                displayName: typeof m.name === "string" ? m.name : undefined,
                number: typeof m.number === "string" ? m.number : undefined,
            }));
            return { ok: true, cases };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: msg };
        }
    }
    if (provider === "litify") {
        const base = (settings.litifyApiUrl ?? process.env.LITIFY_API_URL);
        const token = settings.litifyAccessToken;
        if (!base || !token) {
            return { ok: false, error: "Litify API URL and access token not configured" };
        }
        try {
            const res = await fetch(`${base.replace(/\/$/, "")}/matters?limit=100`, {
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            if (!res.ok) {
                const text = await res.text();
                return { ok: false, error: `Litify API ${res.status}: ${text.slice(0, 200)}` };
            }
            const data = (await res.json());
            const records = data?.records ?? data?.data ?? [];
            const cases = records.map((r) => ({
                externalMatterId: String(r.Id ?? r),
                displayName: typeof r.Name === "string" ? r.Name : undefined,
                number: typeof r.MatterNumber === "string" ? r.MatterNumber : undefined,
            }));
            return { ok: true, cases };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: msg };
        }
    }
    if (provider === "filevine") {
        const base = (settings.filevineApiUrl ?? process.env.FILEVINE_API_URL);
        const token = settings.filevineApiKey;
        if (!base || !token) {
            return { ok: false, error: "Filevine API URL and API key not configured" };
        }
        try {
            const res = await fetch(`${base.replace(/\/$/, "")}/projects?limit=100`, {
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            });
            if (!res.ok) {
                const text = await res.text();
                return { ok: false, error: `Filevine API ${res.status}: ${text.slice(0, 200)}` };
            }
            const data = (await res.json());
            const items = data?.data ?? data?.items ?? [];
            const cases = items.map((p) => ({
                externalMatterId: String(p.id ?? p),
                displayName: typeof p.name === "string" ? p.name : undefined,
            }));
            return { ok: true, cases };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: msg };
        }
    }
    // generic_webhook has no standard "list matters" endpoint
    return { ok: true, cases: [] };
}
/** Resolve externalMatterId for a case: from mapping first, else from params. */
async function resolveExternalMatterId(firmId, caseId, paramExternalId) {
    if (paramExternalId && paramExternalId.trim())
        return paramExternalId.trim();
    const mapping = await prisma_1.prisma.crmCaseMapping.findUnique({
        where: { firmId_caseId: { firmId, caseId } },
        select: { externalMatterId: true },
    });
    return mapping?.externalMatterId ?? null;
}
/** Push an update (note/comment) to the CRM for the given case. Uses CrmCaseMapping for externalMatterId when available. */
async function pushCaseUpdate(params) {
    const { firmId, caseId, title, bodyMarkdown, externalMatterId: paramExternalId, attachments, meta } = params;
    const { provider } = await getFirmCrmSettings(firmId);
    const externalMatterId = await resolveExternalMatterId(firmId, caseId, paramExternalId);
    const msg = {
        firmId,
        caseId,
        externalMatterId: externalMatterId ?? undefined,
        title,
        bodyMarkdown,
        attachments,
        meta,
    };
    if (provider === "generic_webhook" || !externalMatterId) {
        const result = await webhookAdapter_1.default.pushNote(msg);
        if (result.ok)
            return { ok: true, externalId: result.externalId };
        return { ok: false, error: result.error ?? "Webhook push failed" };
    }
    if (provider === "clio") {
        const { settings } = await getFirmCrmSettings(firmId);
        const token = settings.clioAccessToken;
        if (!token)
            return { ok: false, error: "Clio access token not configured" };
        try {
            const res = await fetch(`${CLIO_API_BASE}/notes`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    matter: { id: externalMatterId },
                    subject: title,
                    detail: bodyMarkdown,
                }),
            });
            if (res.status >= 200 && res.status < 300) {
                const data = (await res.json());
                return { ok: true, externalId: data?.data?.id };
            }
            const text = await res.text();
            return { ok: false, error: `Clio ${res.status}: ${text.slice(0, 200)}` };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: message };
        }
    }
    if (provider === "litify" || provider === "filevine") {
        const { settings } = await getFirmCrmSettings(firmId);
        const url = (settings.litifyApiUrl ?? settings.filevineApiUrl ?? process.env.LITIFY_API_URL ?? process.env.FILEVINE_API_URL);
        const token = (settings.litifyAccessToken ?? settings.filevineApiKey);
        if (!url || !token) {
            return { ok: false, error: `${provider} API URL and token not configured` };
        }
        const base = String(url).replace(/\/$/, "");
        const path = provider === "litify" ? `/matters/${externalMatterId}/notes` : `/projects/${externalMatterId}/notes`;
        try {
            const res = await fetch(`${base}${path}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ title, body: bodyMarkdown, ...meta }),
            });
            if (res.status >= 200 && res.status < 300) {
                const data = (await res.json());
                return { ok: true, externalId: data?.id ?? data?.data?.id };
            }
            const text = await res.text();
            return { ok: false, error: `${provider} ${res.status}: ${text.slice(0, 200)}` };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: message };
        }
    }
    const result = await webhookAdapter_1.default.pushNote(msg);
    if (result.ok)
        return { ok: true, externalId: result.externalId };
    return { ok: false, error: result.error ?? "Push failed" };
}
/** Store only caseId, externalMatterId, firmId. No full case records. */
async function upsertCrmCaseMapping(firmId, caseId, externalMatterId) {
    await prisma_1.prisma.crmCaseMapping.upsert({
        where: { firmId_caseId: { firmId, caseId } },
        create: { firmId, caseId, externalMatterId: externalMatterId.trim() },
        update: { externalMatterId: externalMatterId.trim() },
    });
}
/** Get mapping for an internal case (if any). */
async function getCrmCaseMapping(firmId, caseId) {
    const m = await prisma_1.prisma.crmCaseMapping.findUnique({
        where: { firmId_caseId: { firmId, caseId } },
        select: { externalMatterId: true },
    });
    return m;
}
