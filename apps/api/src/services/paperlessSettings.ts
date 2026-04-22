/**
 * Firm-level paperless workflow settings.
 * Stored under Firm.settings.paperless. Folder/file naming defaults remain in Firm.settings.exportNaming (see getFirmExportNamingRules).
 */

import { prisma } from "../db/prisma";

export type PaperlessWorkflowMode = "crm" | "standalone";

export type PreferredExportMode = "download_bundle" | "cloud_drive" | "cloud_folder";

export type PaperlessSettings = {
  /** Default export destination for case packets. */
  preferredExportMode: PreferredExportMode;
  /** When true, documents must be reviewed (e.g. NEEDS_REVIEW resolved) before export is considered final. */
  reviewRequiredBeforeExport: boolean;
  /** crm = CRM-oriented (sync, push to case management); standalone = paperless delivery only. */
  workflowMode: PaperlessWorkflowMode;
};

const DEFAULTS: PaperlessSettings = {
  preferredExportMode: "download_bundle",
  reviewRequiredBeforeExport: true,
  workflowMode: "standalone",
};

const VALID_EXPORT_MODES: PreferredExportMode[] = ["download_bundle", "cloud_drive", "cloud_folder"];
const VALID_WORKFLOW_MODES: PaperlessWorkflowMode[] = ["crm", "standalone"];

function isPreferredExportMode(v: unknown): v is PreferredExportMode {
  return typeof v === "string" && VALID_EXPORT_MODES.includes(v as PreferredExportMode);
}

function isWorkflowMode(v: unknown): v is PaperlessWorkflowMode {
  return typeof v === "string" && VALID_WORKFLOW_MODES.includes(v as PaperlessWorkflowMode);
}

/**
 * Get paperless workflow settings for a firm. Returns defaults for any missing keys.
 */
export async function getPaperlessSettings(firmId: string): Promise<PaperlessSettings> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings = (firm?.settings ?? {}) as Record<string, unknown>;
  const paperless = (settings.paperless ?? {}) as Record<string, unknown>;
  return {
    preferredExportMode: isPreferredExportMode(paperless.preferredExportMode)
      ? paperless.preferredExportMode
      : DEFAULTS.preferredExportMode,
    reviewRequiredBeforeExport:
      typeof paperless.reviewRequiredBeforeExport === "boolean"
        ? paperless.reviewRequiredBeforeExport
        : DEFAULTS.reviewRequiredBeforeExport,
    workflowMode: isWorkflowMode(paperless.workflowMode) ? paperless.workflowMode : DEFAULTS.workflowMode,
  };
}

/**
 * Update paperless workflow settings. Only provided keys are updated.
 */
export async function updatePaperlessSettings(
  firmId: string,
  patch: Partial<PaperlessSettings>
): Promise<PaperlessSettings> {
  const current = await getPaperlessSettings(firmId);
  const next: PaperlessSettings = {
    preferredExportMode: isPreferredExportMode(patch.preferredExportMode)
      ? patch.preferredExportMode
      : current.preferredExportMode,
    reviewRequiredBeforeExport:
      typeof patch.reviewRequiredBeforeExport === "boolean"
        ? patch.reviewRequiredBeforeExport
        : current.reviewRequiredBeforeExport,
    workflowMode: isWorkflowMode(patch.workflowMode) ? patch.workflowMode : current.workflowMode,
  };

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings = (firm?.settings ?? {}) as Record<string, unknown>;
  await prisma.firm.update({
    where: { id: firmId },
    data: { settings: { ...settings, paperless: next } as object },
  });
  return next;
}
