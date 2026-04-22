/**
 * Paperless Transition operational workflow: repeatable onboarding/migration structure.
 * Defines checklist steps, state, naming templates, and CRM mapping placeholders.
 * State is stored in Firm.settings.paperlessTransition; no new tables.
 */

import { prisma } from "../db/prisma";

export type PaperlessTransitionStepId =
  | "intake"
  | "migration_upload"
  | "migration_process"
  | "review_queue"
  | "naming_setup"
  | "crm_mapping"
  | "export_validation"
  | "cleanup"
  | "complete";

export interface PaperlessTransitionStep {
  id: PaperlessTransitionStepId;
  label: string;
  description: string;
  /** API or UI hint for this step */
  apiHint: string;
  /** Optional fallback / manual instructions */
  fallbackNote?: string;
}

export const PAPERLESS_TRANSITION_CHECKLIST: PaperlessTransitionStep[] = [
  {
    id: "intake",
    label: "Intake & scope",
    description: "Confirm document sources, volume, and case structure with the firm.",
    apiHint: "No API; use operational notes.",
    fallbackNote: "If scope unclear: list matter/case IDs and doc types; agree on batch size.",
  },
  {
    id: "migration_upload",
    label: "Migration upload",
    description: "Upload backfile via POST /migration/import (batches of up to 200 files).",
    apiHint: "POST /migration/import (multipart 'files'); GET /migration/batches for list.",
    fallbackNote: "Split large backfiles into batches; re-run failed files after fixing.",
  },
  {
    id: "migration_process",
    label: "Migration processing",
    description: "Wait for migration queue to process (OCR, classification, extraction, case match).",
    apiHint: "GET /migration/batches/:batchId for byStatus, byStage, failed list.",
    fallbackNote: "Check failed docs; fix and re-ingest or mark for manual review.",
  },
  {
    id: "review_queue",
    label: "Review queue",
    description: "Resolve NEEDS_REVIEW and UNMATCHED docs; route to cases; correct recognition where needed.",
    apiHint: "GET /me/review-queue; PATCH /documents/:id/recognition; POST /documents/:id/route.",
    fallbackNote: "Bulk-route by case number/client where possible; handle edge cases manually.",
  },
  {
    id: "naming_setup",
    label: "Folder/case naming standards",
    description: "Set export naming rules (file pattern, folder pattern) for CRM/cloud consistency.",
    apiHint: "Firm.settings.exportNaming (filePattern, folderPattern, folderByDocType).",
    fallbackNote: "Use placeholders: {caseNumber}, {clientName}, {documentType}, {providerName}, {serviceDate}, {date}.",
  },
  {
    id: "crm_mapping",
    label: "CRM mapping notes",
    description: "Record case-to-CRM matter mapping and any field mapping decisions.",
    apiHint: "Firm.settings.paperlessTransition.crmMappingNotes; CrmCaseMapping table for links.",
    fallbackNote: "Document matter ID format and custom field mappings for later sync.",
  },
  {
    id: "export_validation",
    label: "Export validation",
    description: "Run a sample export (case packet or single case); confirm paths and naming.",
    apiHint: "Case packet export; check folder structure and file names.",
    fallbackNote: "Adjust exportNaming if paths don't match firm/CRM expectations.",
  },
  {
    id: "cleanup",
    label: "Cleanup & fallback",
    description: "Address duplicates, failed docs, and edge cases; archive or exclude as agreed.",
    apiHint: "Review queue; duplicate detection; PATCH document or mark resolved/rejected.",
    fallbackNote: "Manual: export list of FAILED/UNMATCHED; firm decides retain or drop.",
  },
  {
    id: "complete",
    label: "Transition complete",
    description: "Sign-off: migration batches processed, review queue clear, naming and CRM notes set.",
    apiHint: "No API; set state to 'complete'; optional Firm.settings.paperlessTransition.completedAt.",
    fallbackNote: "Hand off to firm for ongoing intake; document any remaining manual steps.",
  },
];

export const DEFAULT_NAMING_TEMPLATES = {
  filePattern: "{caseNumber}_{documentType}_{serviceDate}_{originalName}",
  folderPattern: "{clientName}/{caseNumber}",
  folderByDocType: {
    default: "Other",
    medical_record: "Medical Records",
    billing_statement: "Billing",
    insurance_letter: "Insurance",
    court_filing: "Court",
  } as Record<string, string>,
};

export type CrmMappingPlaceholder = {
  field: string;
  description: string;
  example?: string;
};

/** Placeholder config for CRM-ready mapping notes (stored in Firm.settings or operational doc). */
export const CRM_MAPPING_PLACEHOLDERS: CrmMappingPlaceholder[] = [
  { field: "matterIdFormat", description: "CRM matter ID format (e.g. MM-YYYY-NNN)", example: "MM-2024-001" },
  { field: "caseNumberSource", description: "Where case number comes from (internal vs CRM)", example: "Internal; sync to CRM matter custom field" },
  { field: "folderStructure", description: "Target folder structure in cloud/CRM", example: "Matters/{matterId}/Documents/Medical" },
  { field: "customFieldMappings", description: "Firm-specific field mappings for push", example: "doc_type -> Matter Document Type" },
];

export interface PaperlessTransitionState {
  currentStepId: PaperlessTransitionStepId | null;
  completedStepIds: PaperlessTransitionStepId[];
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  crmMappingNotes: Record<string, string> | null;
}

const DEFAULT_STATE: PaperlessTransitionState = {
  currentStepId: "intake",
  completedStepIds: [],
  startedAt: null,
  completedAt: null,
  notes: null,
  crmMappingNotes: null,
};

function getStateFromSettings(settings: unknown): PaperlessTransitionState {
  const s = (settings as Record<string, unknown>)?.paperlessTransition;
  if (!s || typeof s !== "object") return { ...DEFAULT_STATE };
  const o = s as Record<string, unknown>;
  return {
    currentStepId: (o.currentStepId as PaperlessTransitionStepId) ?? DEFAULT_STATE.currentStepId,
    completedStepIds: Array.isArray(o.completedStepIds) ? (o.completedStepIds as PaperlessTransitionStepId[]) : DEFAULT_STATE.completedStepIds,
    startedAt: typeof o.startedAt === "string" ? o.startedAt : DEFAULT_STATE.startedAt,
    completedAt: typeof o.completedAt === "string" ? o.completedAt : DEFAULT_STATE.completedAt,
    notes: typeof o.notes === "string" ? o.notes : DEFAULT_STATE.notes,
    crmMappingNotes: o.crmMappingNotes != null && typeof o.crmMappingNotes === "object" && !Array.isArray(o.crmMappingNotes)
      ? (o.crmMappingNotes as Record<string, string>)
      : DEFAULT_STATE.crmMappingNotes,
  };
}

export async function getPaperlessTransitionState(firmId: string): Promise<PaperlessTransitionState> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  return getStateFromSettings(firm?.settings ?? null);
}

export async function updatePaperlessTransitionState(
  firmId: string,
  update: Partial<PaperlessTransitionState>
): Promise<PaperlessTransitionState> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings = (firm?.settings ?? {}) as Record<string, unknown>;
  const current = getStateFromSettings(settings);
  const next: PaperlessTransitionState = {
    ...current,
    ...update,
    completedStepIds: update.completedStepIds !== undefined ? update.completedStepIds : current.completedStepIds,
    crmMappingNotes: update.crmMappingNotes !== undefined ? update.crmMappingNotes : current.crmMappingNotes,
  };
  if (next.startedAt == null && next.currentStepId != null) {
    next.startedAt = new Date().toISOString();
  }
  if (next.currentStepId === "complete") {
    next.completedAt = next.completedAt ?? new Date().toISOString();
  }
  await prisma.firm.update({
    where: { id: firmId },
    data: { settings: { ...settings, paperlessTransition: next } as object },
  });
  return next;
}

export async function getChecklistWithState(firmId: string): Promise<{
  steps: PaperlessTransitionStep[];
  state: PaperlessTransitionState;
  defaultNaming: typeof DEFAULT_NAMING_TEMPLATES;
  crmPlaceholders: CrmMappingPlaceholder[];
}> {
  const [state, namingRules] = await Promise.all([
    getPaperlessTransitionState(firmId),
    prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } }).then((f) => {
      const s = (f?.settings as Record<string, unknown>)?.exportNaming;
      return s && typeof s === "object" ? s : null;
    }),
  ]);
  return {
    steps: PAPERLESS_TRANSITION_CHECKLIST,
    state,
    defaultNaming: namingRules && typeof namingRules === "object"
      ? { ...DEFAULT_NAMING_TEMPLATES, ...(namingRules as object) }
      : DEFAULT_NAMING_TEMPLATES,
    crmPlaceholders: CRM_MAPPING_PLACEHOLDERS,
  };
}
