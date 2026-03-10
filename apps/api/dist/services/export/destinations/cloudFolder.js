"use strict";
/**
 * Cloud folder destination: write ZIP to S3. Uses firm folder naming rule as prefix when cloudPathPrefix not provided.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudFolderDestination = void 0;
const casePacketExport_1 = require("../../casePacketExport");
const storage_1 = require("../../storage");
const namingRules_1 = require("../namingRules");
exports.cloudFolderDestination = {
    kind: "cloud_folder",
    async export(bundle, options) {
        try {
            const zipBuffer = await (0, casePacketExport_1.buildCasePacketZipFromBundle)(bundle);
            const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            let prefix = options?.cloudPathPrefix?.trim();
            if (!prefix) {
                const rules = await (0, namingRules_1.getFirmExportNamingRules)(bundle.firmId);
                const caseCtx = (0, namingRules_1.buildDocumentNamingContext)(bundle.case, { id: "", originalName: null }, null, bundle.exportedAt);
                const folderPath = rules ? (0, namingRules_1.applyFolderPattern)(rules, caseCtx) : "";
                prefix = folderPath
                    ? `${bundle.firmId}/exports/${folderPath}`
                    : `${bundle.firmId}/exports/cases/${bundle.caseId}`;
            }
            else {
                prefix = prefix.startsWith(bundle.firmId + "/") ? prefix : `${bundle.firmId}/exports/${prefix.replace(/^\//, "")}`;
            }
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
