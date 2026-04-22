/**
 * Builds a ZIP bundle for case packet export: selected documents + optional timeline + summary.
 * Uses the shared ExportBundle contract so all export destinations share one structure.
 */

import JSZip from "jszip";
import { getObjectBuffer } from "./storage";
import { buildPacketEntryFileName } from "./casePacketExportNaming";
import type { ExportBundle } from "./export/contract";

export type ExportPacketInput = {
  caseId: string;
  firmId: string;
  documentIds: string[];
  includeTimeline: boolean;
  includeSummary: boolean;
};

/**
 * Build ZIP buffer from a pre-built ExportBundle (used by all export destinations).
 * Uses exportFileName and exportFolderPath from naming rules when present; otherwise documents/originalName.
 * Deduplicates paths by appending _2, _3 if needed.
 */
export async function buildCasePacketZipFromBundle(bundle: ExportBundle): Promise<Buffer> {
  const zip = new JSZip();
  const usedPaths = new Set<string>();

  function uniquePath(folderPath: string, fileName: string): string {
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
      const buf = await getObjectBuffer(doc.storageKey);
      const folderPath = (doc.exportFolderPath ?? "").trim();
      const fileName = buildPacketEntryFileName(doc);
      const zipPath = uniquePath(folderPath || "documents", fileName);
      zip.file(zipPath, buf, { binary: true });
    } catch (e) {
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

export async function buildCasePacketZip(input: ExportPacketInput): Promise<Buffer> {
  const { caseId, firmId, documentIds, includeTimeline, includeSummary } = input;

  const { buildExportBundle } = await import("./export/contract");
  const bundle = await buildExportBundle(caseId, firmId, {
    documentIds: documentIds.length > 0 ? documentIds : undefined,
    includeTimeline,
    includeSummary,
  });
  if (!bundle) throw new Error("Case not found");

  return buildCasePacketZipFromBundle(bundle);
}
