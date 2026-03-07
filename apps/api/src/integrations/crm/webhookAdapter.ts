/**
 * Generic webhook CRM adapter. POSTs case intelligence payload to a configurable URL.
 * Works with any CRM that accepts webhooks (Zapier, Make, custom endpoints).
 * Retries on 5xx or network errors up to 2 times with backoff.
 */

import type { CrmAdapter, CrmPushMessage } from "./index";
import { prisma } from "../../db/prisma";

const WEBHOOK_RETRY_ATTEMPTS = 2;
const WEBHOOK_RETRY_DELAYS_MS = [1000, 2000];

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function getWebhookUrl(firmId: string): Promise<string | null> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings = firm?.settings as Record<string, unknown> | null | undefined;
  const url = settings?.crmWebhookUrl ?? settings?.crm_webhook_url;
  if (url && typeof url === "string" && url.trim()) return url.trim();
  const envUrl = process.env.FIRM_CRM_WEBHOOK_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) return envUrl.trim();
  return null;
}

const webhookAdapter: CrmAdapter = {
  async pushNote(msg: CrmPushMessage): Promise<{ ok: boolean; externalId?: string; error?: string }> {
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

    let lastErr: string | null = null;
    for (let attempt = 0; attempt <= WEBHOOK_RETRY_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status >= 200 && res.status < 300) {
          const text = await res.text();
          let externalId: string | undefined;
          try {
            const data = JSON.parse(text || "{}");
            externalId = data.id ?? data.externalId ?? data.external_id;
          } catch {
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
      } catch (e) {
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

export default webhookAdapter;
