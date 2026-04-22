/**
 * Retention cleanup: delete documents older than firm.retentionDays.
 * Removes from Spaces (S3) and DB. Logs failures to SystemErrorLog, creates Notification summary.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import { deleteObject } from "./storage";
import { logSystemError } from "./errorLog";
import { createNotification } from "./notifications";

const SERVICE = "retention-cleanup";

export type RetentionCleanupResult = {
  firmId: string;
  firmName: string;
  deleted: number;
  errors: string[];
};

export async function runRetentionCleanup(): Promise<RetentionCleanupResult[]> {
  const firms = await prisma.firm.findMany({
    select: { id: true, name: true, retentionDays: true },
  });

  const results: RetentionCleanupResult[] = [];

  for (const firm of firms) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - firm.retentionDays);

    const docs = await prisma.document.findMany({
      where: {
        firmId: firm.id,
        createdAt: { lt: cutoff },
      },
      select: { id: true, spacesKey: true },
    });

    const errors: string[] = [];
    let deleted = 0;

    for (const doc of docs) {
      try {
        await deleteObject(doc.spacesKey);
      } catch (e) {
        const msg = `Failed to delete Spaces object ${doc.spacesKey} for document ${doc.id}: ${String((e as Error)?.message ?? e)}`;
        errors.push(msg);
        logSystemError(SERVICE, msg, (e as Error)?.stack);
        continue;
      }

      try {
        await prisma.document.updateMany({ where: { duplicateOfId: doc.id }, data: { duplicateOfId: null } });
        await prisma.caseTimelineEvent.deleteMany({ where: { documentId: doc.id } });
        await prisma.documentAuditEvent.deleteMany({ where: { documentId: doc.id } });
        await pgPool.query("DELETE FROM document_recognition WHERE document_id = $1", [doc.id]);
        await prisma.document.delete({ where: { id: doc.id } });
        deleted++;
      } catch (e) {
        const msg = `Failed to delete DB records for document ${doc.id}: ${String((e as Error)?.message ?? e)}`;
        errors.push(msg);
        logSystemError(SERVICE, msg, (e as Error)?.stack);
      }
    }

    if (deleted > 0) {
      createNotification(
        firm.id,
        "retention_cleanup",
        `Cleanup removed ${deleted} doc${deleted !== 1 ? "s" : ""}`,
        `Retention cleanup removed ${deleted} document${deleted !== 1 ? "s" : ""} older than ${firm.retentionDays} days.`,
        { deleted, firmId: firm.id }
      ).catch((e) => {
        logSystemError(SERVICE, `Failed to create cleanup notification for firm ${firm.id}: ${String((e as Error)?.message ?? e)}`);
      });
    }

    results.push({
      firmId: firm.id,
      firmName: firm.name,
      deleted,
      errors,
    });
  }

  return results;
}
