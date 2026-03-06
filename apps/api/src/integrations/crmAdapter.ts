/**
 * Placeholder CRM adapter interface for routing documents to Clio, Litify, etc.
 * Not full integrations yet — adapters implement this and are called after recognition.
 */

export type CrmSystem = "clio" | "litify" | "generic";

export type RouteToCrmOptions = {
  documentId: string;
  system: CrmSystem;
  /** External matter/case id in the CRM (e.g. Clio matter id, Litify case id). */
  caseId: string;
  /** Optional firm-level config (API keys, tenant id). */
  config?: Record<string, string>;
};

export type RouteToCrmResult =
  | { ok: true; externalId?: string }
  | { ok: false; error: string };

/**
 * Route a document to a CRM. Adapters (Clio, Litify) will implement this.
 * Document row should be updated with routedSystem and routedCaseId on success.
 */
export type RouteToCrm = (options: RouteToCrmOptions) => Promise<RouteToCrmResult>;

/** Placeholder: no-op adapter. Replace with real Clio/Litify clients. */
export const noopRouteToCrm: RouteToCrm = async () => {
  return { ok: false, error: "CRM adapter not implemented" };
};
