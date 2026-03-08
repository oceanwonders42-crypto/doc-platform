/**
 * Cloud drive destination: write each document as a separate file in an organized folder structure.
 * Uses naming rules (case + document category). Compatible with future drive adapters via IDriveAdapter.
 * Firms that do not use CRM can use this for paperless delivery (e.g. S3/Spaces as a "drive").
 */

import type { IExportDestination } from "./types";
import type { ExportBundle } from "../contract";
import type { ExportDestinationOptions } from "./types";
import { getObjectBuffer } from "../../storage";
import { createS3DriveAdapter } from "../drive/s3DriveAdapter";
import { getFirmExportNamingRules, applyFolderPattern, buildDocumentNamingContext } from "../namingRules";

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
}

export const cloudDriveDestination: IExportDestination = {
  kind: "cloud_drive",

  async export(
    bundle: ExportBundle,
    options?: ExportDestinationOptions
  ): Promise<{ ok: boolean; kind: "cloud_drive"; storageKey?: string; filesWritten?: number; error?: string }> {
    try {
      const pathPrefix = (options?.cloudDrivePathPrefix as string)?.trim() || "drive";
      const adapter = createS3DriveAdapter(bundle.firmId, pathPrefix);

      const rules = await getFirmExportNamingRules(bundle.firmId);
      const caseCtx = buildDocumentNamingContext(
        bundle.case,
        { id: "", originalName: null },
        null,
        bundle.exportedAt
      );
      const caseLevelFolder = rules ? applyFolderPattern(rules, caseCtx) : `cases/${bundle.caseId}`;
      const casePrefix = caseLevelFolder ? `${caseLevelFolder}`.replace(/\/+/g, "/") : bundle.caseId;

      const usedPaths = new Set<string>();
      let filesWritten = 0;

      for (const doc of bundle.documents) {
        try {
          const buf = await getObjectBuffer(doc.storageKey);
          const folderPath = (doc.exportFolderPath ?? "").trim() || casePrefix;
          const fileName = doc.exportFileName?.trim() || sanitizeFileName(doc.originalName || doc.id) + "." + ((doc.originalName ?? "").split(".").pop()?.toLowerCase() || "bin");
          let relativePath = folderPath ? `${folderPath}/${fileName}` : fileName;
          let n = 2;
          while (usedPaths.has(relativePath)) {
            const extIdx = fileName.lastIndexOf(".");
            const base = extIdx > 0 ? fileName.slice(0, extIdx) : fileName;
            const ext = extIdx > 0 ? fileName.slice(extIdx) : "";
            relativePath = folderPath ? `${folderPath}/${base}_${n}${ext}` : `${base}_${n}${ext}`;
            n += 1;
          }
          usedPaths.add(relativePath);
          await adapter.putFile(relativePath, buf, doc.mimeType ?? "application/octet-stream");
          filesWritten += 1;
        } catch (e) {
          console.warn("[cloud_drive] Failed to write document", doc.id, e);
        }
      }

      if (bundle.timelineText) {
        const timelinePath = `${casePrefix}/timeline.txt`;
        await adapter.putFile(timelinePath, Buffer.from(bundle.timelineText, "utf-8"), "text/plain");
        filesWritten += 1;
      }
      if (bundle.summaryText) {
        const summaryPath = `${casePrefix}/summary.txt`;
        await adapter.putFile(summaryPath, Buffer.from(bundle.summaryText, "utf-8"), "text/plain");
        filesWritten += 1;
      }

      return {
        ok: true,
        kind: "cloud_drive",
        storageKey: `${bundle.firmId}/${pathPrefix}/${casePrefix}`.replace(/\/+/g, "/"),
        filesWritten,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { ok: false, kind: "cloud_drive", error };
    }
  },
};
