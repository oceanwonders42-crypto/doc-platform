/**
 * Provider-to-case linking: connect resolved document providers to case context.
 * - Only links when provider is resolved (suggested_provider_id + provider_resolution_status = 'resolved').
 * - Uses upsert to avoid duplicate CaseProvider rows when the same provider is detected on multiple docs.
 * - Unresolved providers are not linked; manual correction can add/remove CaseProvider later.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";

const DEFAULT_RELATIONSHIP = "treating";

/**
 * If the document has a resolved provider (suggested_provider_id), ensure a CaseProvider link
 * exists for the given case. Idempotent: repeated calls for the same document/case do not
 * create duplicate links.
 */
export async function ensureProviderCaseLinkFromDocument(
  firmId: string,
  documentId: string,
  caseId: string
): Promise<{ linked: boolean; providerId?: string }> {
  const { rows } = await pgPool.query<{
    suggested_provider_id: string | null;
    provider_resolution_status: string | null;
  }>(
    `select suggested_provider_id, provider_resolution_status from document_recognition where document_id = $1`,
    [documentId]
  );
  const rec = rows[0];
  const providerId = rec?.suggested_provider_id?.trim() || null;
  const status = rec?.provider_resolution_status?.trim() || null;

  if (!providerId || status !== "resolved") {
    return { linked: false };
  }

  const caseRow = await prisma.legalCase.findFirst({
    where: { id: caseId, firmId },
    select: { id: true },
  });
  if (!caseRow) return { linked: false };

  const providerRow = await prisma.provider.findFirst({
    where: { id: providerId, firmId },
    select: { id: true },
  });
  if (!providerRow) return { linked: false };

  await prisma.caseProvider.upsert({
    where: {
      firmId_caseId_providerId: { firmId, caseId, providerId },
    },
    create: {
      firmId,
      caseId,
      providerId,
      relationship: DEFAULT_RELATIONSHIP,
    },
    update: {},
  });

  return { linked: true, providerId };
}
