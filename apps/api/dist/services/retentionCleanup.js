"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRetentionCleanup = runRetentionCleanup;
/**
 * Retention cleanup: delete documents older than firm.retentionDays.
 * Removes from Spaces (S3) and DB. Logs failures to SystemErrorLog, creates Notification summary.
 */
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const storage_1 = require("./storage");
const errorLog_1 = require("./errorLog");
const notifications_1 = require("./notifications");
const SERVICE = "retention-cleanup";
async function runRetentionCleanup() {
    const firms = await prisma_1.prisma.firm.findMany({
        select: { id: true, name: true, retentionDays: true },
    });
    const results = [];
    for (const firm of firms) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - firm.retentionDays);
        const docs = await prisma_1.prisma.document.findMany({
            where: {
                firmId: firm.id,
                createdAt: { lt: cutoff },
            },
            select: { id: true, spacesKey: true },
        });
        const errors = [];
        let deleted = 0;
        for (const doc of docs) {
            try {
                await (0, storage_1.deleteObject)(doc.spacesKey);
            }
            catch (e) {
                const msg = `Failed to delete Spaces object ${doc.spacesKey} for document ${doc.id}: ${String(e?.message ?? e)}`;
                errors.push(msg);
                (0, errorLog_1.logSystemError)(SERVICE, msg, e?.stack);
                continue;
            }
            try {
                await prisma_1.prisma.document.updateMany({ where: { duplicateOfId: doc.id }, data: { duplicateOfId: null } });
                await prisma_1.prisma.caseTimelineEvent.deleteMany({ where: { documentId: doc.id } });
                await prisma_1.prisma.documentAuditEvent.deleteMany({ where: { documentId: doc.id } });
                await pg_1.pgPool.query("DELETE FROM document_recognition WHERE document_id = $1", [doc.id]);
                await prisma_1.prisma.document.delete({ where: { id: doc.id } });
                deleted++;
            }
            catch (e) {
                const msg = `Failed to delete DB records for document ${doc.id}: ${String(e?.message ?? e)}`;
                errors.push(msg);
                (0, errorLog_1.logSystemError)(SERVICE, msg, e?.stack);
            }
        }
        if (deleted > 0) {
            (0, notifications_1.createNotification)(firm.id, "retention_cleanup", `Cleanup removed ${deleted} doc${deleted !== 1 ? "s" : ""}`, `Retention cleanup removed ${deleted} document${deleted !== 1 ? "s" : ""} older than ${firm.retentionDays} days.`, { deleted, firmId: firm.id }).catch((e) => {
                (0, errorLog_1.logSystemError)(SERVICE, `Failed to create cleanup notification for firm ${firm.id}: ${String(e?.message ?? e)}`);
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
