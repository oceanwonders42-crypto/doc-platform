/**
 * Generic webhook CRM adapter. POSTs case intelligence payload to a configurable URL.
 * Works with any CRM that accepts webhooks (Zapier, Make, custom endpoints).
 */

import type { CrmAdapter, CrmPushMessage } from "./index";
import { prisma } from "../../db/prisma";

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
      return { ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message };
    }
  },
};

export default webhookAdapter;
