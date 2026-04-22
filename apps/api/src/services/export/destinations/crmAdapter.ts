/**
 * CRM adapter destination: push a case packet ready note to the firm's CRM (no file upload).
 * Uses existing pushCaseUpdate / CrmPushLog. New CRM adapters plug into the same push path.
 */

import type { IExportDestination } from "./types";
import type { ExportBundle } from "../contract";
import { pushCrmWebhook } from "../../../integrations/crm/pushService";

export const crmDestination: IExportDestination = {
  kind: "crm",

  async export(bundle: ExportBundle): Promise<{ ok: boolean; kind: "crm"; externalId?: string; error?: string }> {
    const title = "Case packet ready for export";
    const caseLabel = [bundle.case.caseNumber, bundle.case.clientName, bundle.case.title].filter(Boolean).join(" — ") || bundle.caseId;
    const bodyMarkdown = [
      `**Case:** ${caseLabel}`,
      `**Documents:** ${bundle.documents.length} file(s)`,
      bundle.summaryText ? `**Summary:** ${bundle.summaryText.slice(0, 500)}${bundle.summaryText.length > 500 ? "…" : ""}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await pushCrmWebhook({
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
