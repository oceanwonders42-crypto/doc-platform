"use strict";
/**
 * Builds a ZIP bundle for case packet export: selected documents + optional timeline + summary.
 * Uses the shared ExportBundle contract so all export destinations share one structure.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCasePacketZipFromBundle = buildCasePacketZipFromBundle;
exports.buildCasePacketZip = buildCasePacketZip;
const jszip_1 = __importDefault(require("jszip"));
const storage_1 = require("./storage");
function sanitizeFileName(name) {
    return name.replace(/[^\w\s\-\.]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
}
/**
 * Build ZIP buffer from a pre-built ExportBundle (used by all export destinations).
 * Uses exportFileName and exportFolderPath from naming rules when present; otherwise documents/originalName.
 * Deduplicates paths by appending _2, _3 if needed.
 */
async function buildCasePacketZipFromBundle(bundle) {
    const zip = new jszip_1.default();
    const usedPaths = new Set();
    function uniquePath(folderPath, fileName) {
        const base = folderPath ? `${folderPath}/${fileName}` : fileName;
        let path = base;
        let n = 2;
        while (usedPaths.has(path)) {
            const extIdx = fileName.lastIndexOf(".");
            const name = extIdx > 0 ? fileName.slice(0, extIdx) : fileName;
            const ext = extIdx > 0 ? fileName.slice(extIdx) : "";
            path = folderPath ? `${folderPath}/${name}_${n}${ext}` : `${name}_${n}${ext}`;
            n += 1;
        }
        usedPaths.add(path);
        return path;
    }
    for (const doc of bundle.documents) {
        try {
            const buf = await (0, storage_1.getObjectBuffer)(doc.storageKey);
            const baseName = sanitizeFileName(doc.originalName || doc.id);
            const ext = (doc.originalName || "").split(".").pop()?.toLowerCase() || "bin";
            const folderPath = (doc.exportFolderPath ?? "").trim();
            const fileName = doc.exportFileName?.trim() || `${baseName}.${ext}`;
            const zipPath = uniquePath(folderPath || "documents", fileName);
            zip.file(zipPath, buf, { binary: true });
        }
        catch (e) {
            console.warn("[export-packet] Failed to fetch document", doc.id, e);
        }
    }
    if (bundle.timelineText) {
        zip.file("timeline.txt", bundle.timelineText);
    }
    if (bundle.summaryText) {
        zip.file("summary.txt", bundle.summaryText);
    }
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
async function buildCasePacketZip(input) {
    const { caseId, firmId, documentIds, includeTimeline, includeSummary } = input;
    const { buildExportBundle } = await Promise.resolve().then(() => __importStar(require("./export/contract")));
    const bundle = await buildExportBundle(caseId, firmId, {
        documentIds: documentIds.length > 0 ? documentIds : undefined,
        includeTimeline,
        includeSummary,
    });
    if (!bundle)
        throw new Error("Case not found");
    return buildCasePacketZipFromBundle(bundle);
}
