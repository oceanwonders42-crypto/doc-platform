/**
 * Webhook delivery: emit events, sign with HMAC, retry via Job table.
 */
import crypto from "crypto";
import { prisma } from "../db/prisma";
import { enqueueJob } from "./jobRunner";

export const WEBHOOK_EVENTS = [
  "document.processed",
  "document.routed",
  "case.created",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

function isValidEvent(name: string): name is WebhookEvent {
  return WEBHOOK_EVENTS.includes(name as WebhookEvent);
}

/** Emit a webhook event. Finds enabled endpoints subscribed to the event and enqueues delivery jobs. */
export async function emitWebhookEvent(
  firmId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { firmId, enabled: true },
    select: { id: true, url: true, secret: true, eventsJson: true },
  });

  for (const ep of endpoints) {
    const events = ep.eventsJson;
    const subscribed =
      Array.isArray(events) &&
      events.some((e) => typeof e === "string" && (e === "*" || e === event || isValidEvent(e)));
    if (!subscribed) continue;

    await enqueueJob(firmId, "webhook_delivery", {
      webhookEndpointId: ep.id,
      url: ep.url,
      secret: ep.secret,
      event,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/** Deliver a webhook (called by job runner). */
export async function deliverWebhook(payload: {
  webhookEndpointId: string;
  url: string;
  secret: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}): Promise<void> {
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
