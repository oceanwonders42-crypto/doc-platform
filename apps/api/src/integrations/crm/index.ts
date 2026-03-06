/**
 * CRM adapter interface for pushing case intelligence updates to external CRMs.
 * No internal task/contact/case state—only outbound message delivery.
 */

export type CrmProvider = "clio" | "litify" | "filevine" | "generic_webhook";

export type CrmPushMessage = {
  firmId: string;
  caseId: string;
  externalMatterId?: string;
  title: string;
  bodyMarkdown: string;
  attachments?: Array<{ documentId: string; fileName?: string; fileUrl?: string }>;
  meta?: Record<string, unknown>;
};

export interface CrmAdapter {
  pushNote(msg: CrmPushMessage): Promise<{ ok: boolean; externalId?: string; error?: string }>;
}
