"use strict";
/**
 * Generic webhook CRM adapter. POSTs case intelligence payload to a configurable URL.
 * Works with any CRM that accepts webhooks (Zapier, Make, custom endpoints).
 * Retries on 5xx or network errors up to 2 times with backoff.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebhookUrl = getWebhookUrl;
const prisma_1 = require("../../db/prisma");
const WEBHOOK_RETRY_ATTEMPTS = 2;
const WEBHOOK_RETRY_DELAYS_MS = [1000, 2000];
async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function getWebhookUrl(firmId) {
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { settings: true },
    });
    const settings = firm?.settings;
    const url = settings?.crmWebhookUrl ?? settings?.crm_webhook_url;
    if (url && typeof url === "string" && url.trim())
        return url.trim();
    const envUrl = process.env.FIRM_CRM_WEBHOOK_URL;
    if (envUrl && typeof envUrl === "string" && envUrl.trim())
        return envUrl.trim();
    return null;
}
const webhookAdapter = {
    async pushNote(msg) {
        const url = await getWebhookUrl(msg.firmId);
        if (!url) {
            return { ok: false, error: "CRM webhook URL not configured (firm settings or FIRM_CRM_WEBHOOK_URL)" };
        }
        const payload = {
            title: msg.title,
            bodyMarkdown: msg.bodyMarkdown,
            caseId: msg.caseId,
            externalMatterId: msg.externalMatterId,
            attachments: msg.attachments ?? [],
            meta: msg.meta ?? {},
            firmId: msg.firmId,
        };
        let lastErr = null;
        for (let attempt = 0; attempt <= WEBHOOK_RETRY_ATTEMPTS; attempt++) {
            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (res.status >= 200 && res.status < 300) {
                    const text = await res.text();
                    let externalId;
                    try {
                        const data = JSON.parse(text || "{}");
                        externalId = data.id ?? data.externalId ?? data.external_id;
                    }
                    catch {
                        // ignore
                    }
                    return { ok: true, externalId };
                }
                const errText = await res.text();
                lastErr = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
                const retryable = res.status >= 500 || res.status === 429;
                if (retryable && attempt < WEBHOOK_RETRY_ATTEMPTS) {
                    await sleep(WEBHOOK_RETRY_DELAYS_MS[attempt]);
                    continue;
                }
                return { ok: false, error: lastErr };
            }
            catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                lastErr = message;
                if (attempt < WEBHOOK_RETRY_ATTEMPTS) {
                    await sleep(WEBHOOK_RETRY_DELAYS_MS[attempt]);
                    continue;
                }
                return { ok: false, error: message };
            }
        }
        return { ok: false, error: lastErr ?? "Webhook request failed" };
    },
};
exports.default = webhookAdapter;
