"use strict";
/**
 * Cloud folder destination: write ZIP to S3 at firmId/exports/cases/{caseId}/{timestamp}.zip.
 * No CasePacketExport record; suitable for automated sync or cloud drive workflows.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudFolderDestination = void 0;
const casePacketExport_1 = require("../../casePacketExport");
const storage_1 = require("../../storage");
exports.cloudFolderDestination = {
    kind: "cloud_folder",
    async export(bundle, options) {
        try {
            const zipBuffer = await (0, casePacketExport_1.buildCasePacketZipFromBundle)(bundle);
            const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const prefix = options?.cloudPathPrefix?.trim() || `${bundle.firmId}/exports/cases/${bundle.caseId}`;
            const fileName = `case-packet-${ts}.zip`;
            const key = `${prefix.replace(/\/$/, "")}/${fileName}`;
            await (0, storage_1.putObject)(key, zipBuffer, "application/zip");
            return {
                ok: true,
                kind: "cloud_folder",
                storageKey: key,
                fileName,
            };
        }
        catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            return { ok: false, kind: "cloud_folder", error };
        }
    },
};
