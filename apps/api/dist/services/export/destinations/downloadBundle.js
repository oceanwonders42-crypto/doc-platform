"use strict";
/**
 * Download bundle destination: build ZIP, upload to S3, create CasePacketExport record.
 * Same behavior as legacy export.packet; uses shared ExportBundle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadBundleDestination = void 0;
const casePacketExport_1 = require("../../casePacketExport");
const storage_1 = require("../../storage");
const prisma_1 = require("../../../db/prisma");
function packetFileName(packetType, dateStr) {
    const slug = packetType === "records" ? "records" : packetType === "bills" ? "bills" : "packet";
    return `case-${slug}-${dateStr}.zip`;
}
exports.downloadBundleDestination = {
    kind: "download_bundle",
    async export(bundle, options) {
        try {
            const zipBuffer = await (0, casePacketExport_1.buildCasePacketZipFromBundle)(bundle);
            const ts = bundle.exportedAt.slice(0, 10);
            const packetType = options?.packetType || "combined";
            const fileName = packetFileName(packetType, ts);
            const key = `${bundle.firmId}/packet_exports/${bundle.caseId}_${Date.now()}.zip`;
            await (0, storage_1.putObject)(key, zipBuffer, "application/zip");
            const row = await prisma_1.prisma.casePacketExport.create({
                data: { firmId: bundle.firmId, caseId: bundle.caseId, storageKey: key, fileName, packetType },
            });
            return {
                ok: true,
                kind: "download_bundle",
                storageKey: key,
                fileName,
                externalId: row.id,
            };
        }
        catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { ok: false, kind: "download_bundle", error };
        }
    },
};
