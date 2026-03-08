"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBHOOK_EVENTS = void 0;
exports.emitWebhookEvent = emitWebhookEvent;
exports.deliverWebhook = deliverWebhook;
/**
 * Webhook delivery: emit events, sign with HMAC, retry via Job table.
 */
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../db/prisma");
const jobRunner_1 = require("./jobRunner");
exports.WEBHOOK_EVENTS = [
    "document.processed",
    "document.routed",
    "case.created",
];
function isValidEvent(name) {
    return exports.WEBHOOK_EVENTS.includes(name);
}
/** Emit a webhook event. Finds enabled endpoints subscribed to the event and enqueues delivery jobs. */
async function emitWebhookEvent(firmId, event, data) {
    const endpoints = await prisma_1.prisma.webhookEndpoint.findMany({
        where: { firmId, enabled: true },
        select: { id: true, url: true, secret: true, eventsJson: true },
    });
    for (const ep of endpoints) {
        const events = ep.eventsJson;
        const subscribed = Array.isArray(events) &&
            events.some((e) => typeof e === "string" && (e === "*" || e === event || isValidEvent(e)));
        if (!subscribed)
            continue;
        await (0, jobRunner_1.enqueueJob)(firmId, "webhook_delivery", {
            webhookEndpointId: ep.id,
            url: ep.url,
            secret: ep.secret,
            event,
            data,
            timestamp: new Date().toISOString(),
        });
    }
}
function signPayload(payload, secret) {
    return crypto_1.default.createHmac("sha256", secret).update(payload).digest("hex");
}
/** Deliver a webhook (called by job runner). */
async function deliverWebhook(payload) {
    const body = JSON.stringify({
        event: payload.event,
        timestamp: payload.timestamp,
        data: payload.data,
    });
    const signature = signPayload(body, payload.secret);
    const res = await fetch(payload.url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": `sha256=${signature}`,
        },
        body,
    });
    if (res.status < 200 || res.status >= 300) {
        const text = await res.text();
        throw new Error(`Webhook delivery failed: ${res.status} ${text.slice(0, 500)}`);
    }
}
