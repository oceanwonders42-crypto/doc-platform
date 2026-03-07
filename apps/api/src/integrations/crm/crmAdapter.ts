/**
 * CRM case sync adapter: read cases from external CRMs and push updates back.
 * Does NOT store full case records locally—only caseId, externalMatterId, firmId (CrmCaseMapping).
 *
 * Supported providers: clio, litify, filevine, generic_webhook.
 */

import { prisma } from "../../db/prisma";
import type { CrmProvider } from "./index";
import type { CrmPushMessage } from "./index";
import webhookAdapter from "./webhookAdapter";
import { getClioAccessToken } from "../../services/clioConfig";

export type CrmCaseRef = {
  externalMatterId: string;
  displayName?: string;
  /** Optional provider-specific id for display */
  number?: string;
};

export type FetchCasesResult =
  | { ok: true; cases: CrmCaseRef[] }
  | { ok: false; error: string };

export type PushCaseUpdateParams = {
  firmId: string;
  caseId: string;
  title: string;
  bodyMarkdown: string;
  externalMatterId?: string;
  attachments?: CrmPushMessage["attachments"];
  meta?: Record<string, unknown>;
};

export type PushCaseUpdateResult =
  | { ok: true; externalId?: string }
  | { ok: false; error: string };

const CLIO_API_BASE = process.env.CLIO_API_BASE_URL || "https://app.clio.com/api/v4";

async function getFirmCrmSettings(firmId: string): Promise<{
  provider: CrmProvider | null;
  settings: Record<string, unknown>;
}> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings = (firm?.settings as Record<string, unknown>) ?? {};
  const provider = (settings.crmProvider ?? settings.crm ?? "generic_webhook") as CrmProvider;
  const valid: CrmProvider[] = ["clio", "litify", "filevine", "generic_webhook"];
  return {
    provider: valid.includes(provider) ? provider : "generic_webhook",
    settings,
  };
}

/** Fetch matters/cases from the firm's configured CRM. Returns minimal refs only; no full records stored. */
export async function fetchCasesFromCRM(firmId: string): Promise<FetchCasesResult> {
  const { provider, settings } = await getFirmCrmSettings(firmId);

  if (provider === "clio") {
    const tokenResult = await getClioAccessToken(firmId);
    if (!tokenResult.configured) {
      return { ok: false, error: tokenResult.error ?? "Clio access token not configured" };
    }
    const token = tokenResult.accessToken;
    try {
      const res = await fetch(`${CLIO_API_BASE}/matters?limit=100`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Clio API ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = (await res.json()) as { data?: Array<{ id?: string; name?: string; number?: string }> };
      const matters = data?.data ?? [];
      const cases: CrmCaseRef[] = matters.map((m) => ({
        externalMatterId: String(m.id ?? ""),
        displayName: typeof m.name === "string" ? m.name : undefined,
        number: typeof m.number === "string" ? m.number : undefined,
      }));
      return { ok: true, cases };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  if (provider === "litify") {
    const base = (settings.litifyApiUrl ?? process.env.LITIFY_API_URL) as string | undefined;
    const token = settings.litifyAccessToken as string | undefined;
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
      const data = (await res.json()) as { records?: Array<{ Id?: string; Name?: string; MatterNumber?: string }>; data?: Array<{ Id?: string; Name?: string; MatterNumber?: string }> };
      const records = data?.records ?? data?.data ?? [];
      const cases: CrmCaseRef[] = records.map((r: { Id?: string; Name?: string; MatterNumber?: string }) => ({
        externalMatterId: String(r.Id ?? r),
        displayName: typeof r.Name === "string" ? r.Name : undefined,
        number: typeof r.MatterNumber === "string" ? r.MatterNumber : undefined,
      }));
      return { ok: true, cases };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  if (provider === "filevine") {
    const base = (settings.filevineApiUrl ?? process.env.FILEVINE_API_URL) as string | undefined;
    const token = settings.filevineApiKey as string | undefined;
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
      const data = (await res.json()) as { data?: Array<{ id?: string; name?: string }>; items?: Array<{ id?: string; name?: string }> };
      const items = data?.data ?? data?.items ?? [];
      const cases: CrmCaseRef[] = items.map((p: { id?: string; name?: string }) => ({
        externalMatterId: String(p.id ?? p),
        displayName: typeof p.name === "string" ? p.name : undefined,
      }));
      return { ok: true, cases };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  // generic_webhook has no standard "list matters" endpoint
  return { ok: true, cases: [] };
}

/** Resolve externalMatterId for a case: from mapping first, else from params. */
async function resolveExternalMatterId(
  firmId: string,
  caseId: string,
  paramExternalId?: string
): Promise<string | null> {
  if (paramExternalId && paramExternalId.trim()) return paramExternalId.trim();
  const mapping = await prisma.crmCaseMapping.findUnique({
    where: { firmId_caseId: { firmId, caseId } },
    select: { externalMatterId: true },
  });
  return mapping?.externalMatterId ?? null;
}

/** Push an update (note/comment) to the CRM for the given case. Uses CrmCaseMapping for externalMatterId when available. */
export async function pushCaseUpdate(params: PushCaseUpdateParams): Promise<PushCaseUpdateResult> {
  const { firmId, caseId, title, bodyMarkdown, externalMatterId: paramExternalId, attachments, meta } = params;

  const { provider } = await getFirmCrmSettings(firmId);
  const externalMatterId = await resolveExternalMatterId(firmId, caseId, paramExternalId);

  const msg: CrmPushMessage = {
    firmId,
    caseId,
    externalMatterId: externalMatterId ?? undefined,
    title,
    bodyMarkdown,
    attachments,
    meta,
  };

  if (provider === "generic_webhook" || !externalMatterId) {
    const result = await webhookAdapter.pushNote(msg);
    if (result.ok) return { ok: true, externalId: result.externalId };
    return { ok: false, error: result.error ?? "Webhook push failed" };
  }

  if (provider === "clio") {
    const tokenResult = await getClioAccessToken(firmId);
    if (!tokenResult.configured) {
      return { ok: false, error: tokenResult.error ?? "Clio access token not configured" };
    }
    const token = tokenResult.accessToken;
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
        const data = (await res.json()) as { data?: { id?: string } };
        return { ok: true, externalId: data?.data?.id };
      }
      const text = await res.text();
      return { ok: false, error: `Clio ${res.status}: ${text.slice(0, 200)}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  if (provider === "litify" || provider === "filevine") {
    const { settings } = await getFirmCrmSettings(firmId);
    const url = (settings.litifyApiUrl ?? settings.filevineApiUrl ?? process.env.LITIFY_API_URL ?? process.env.FILEVINE_API_URL) as string | undefined;
    const token = (settings.litifyAccessToken ?? settings.filevineApiKey) as string | undefined;
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
        const data = (await res.json()) as { id?: string; data?: { id?: string } };
        return { ok: true, externalId: data?.id ?? data?.data?.id };
      }
      const text = await res.text();
      return { ok: false, error: `${provider} ${res.status}: ${text.slice(0, 200)}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  const result = await webhookAdapter.pushNote(msg);
  if (result.ok) return { ok: true, externalId: result.externalId };
  return { ok: false, error: result.error ?? "Push failed" };
}

/** Store only caseId, externalMatterId, firmId. No full case records. */
export async function upsertCrmCaseMapping(
  firmId: string,
  caseId: string,
  externalMatterId: string
): Promise<void> {
  await prisma.crmCaseMapping.upsert({
    where: { firmId_caseId: { firmId, caseId } },
    create: { firmId, caseId, externalMatterId: externalMatterId.trim() },
    update: { externalMatterId: externalMatterId.trim() },
  });
}

/** Get mapping for an internal case (if any). */
export async function getCrmCaseMapping(
  firmId: string,
  caseId: string
): Promise<{ externalMatterId: string } | null> {
  const m = await prisma.crmCaseMapping.findUnique({
    where: { firmId_caseId: { firmId, caseId } },
    select: { externalMatterId: true },
  });
  return m;
}
