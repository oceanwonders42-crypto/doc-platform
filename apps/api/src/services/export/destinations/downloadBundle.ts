/**
 * Download bundle destination: build ZIP, upload to S3, create CasePacketExport record.
 * Same behavior as legacy export.packet; uses shared ExportBundle.
 */

import type { IExportDestination } from "./types";
import type { ExportBundle } from "../contract";
import type { ExportDestinationOptions } from "./types";
import { buildCasePacketZipFromBundle } from "../../casePacketExport";
import { putObject } from "../../storage";
import { prisma } from "../../../db/prisma";

function packetFileName(packetType: string, dateStr: string): string {
  const slug = packetType === "records" ? "records" : packetType === "bills" ? "bills" : "packet";
  return `case-${slug}-${dateStr}.zip`;
}

export const downloadBundleDestination: IExportDestination = {
  kind: "download_bundle",

  async export(
    bundle: ExportBundle,
    options?: ExportDestinationOptions
  ): Promise<{ ok: boolean; kind: "download_bundle"; storageKey?: string; fileName?: string; externalId?: string; error?: string }> {
    try {
      const zipBuffer = await buildCasePacketZipFromBundle(bundle);
      const ts = bundle.exportedAt.slice(0, 10);
      const packetType = (options?.packetType as "records" | "bills" | "combined") || "combined";
      const fileName = packetFileName(packetType, ts);
      const key = `${bundle.firmId}/packet_exports/${bundle.caseId}_${Date.now()}.zip`;
      await putObject(key, zipBuffer, "application/zip");
      const row = await prisma.casePacketExport.create({
        data: { firmId: bundle.firmId, caseId: bundle.caseId, storageKey: key, fileName, packetType },
      });
      return {
        ok: true,
        kind: "download_bundle",
        storageKey: key,
        fileName,
        externalId: row.id,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { ok: false, kind: "download_bundle", error };
    }
  },
};
