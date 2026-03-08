/**
 * Cloud folder destination: write ZIP to S3. Uses firm folder naming rule as prefix when cloudPathPrefix not provided.
 */

import type { IExportDestination } from "./types";
import type { ExportBundle } from "../contract";
import type { ExportDestinationOptions } from "./types";
import { buildCasePacketZipFromBundle } from "../../casePacketExport";
import { putObject } from "../../storage";
import { getFirmExportNamingRules, applyFolderPattern, buildDocumentNamingContext } from "../namingRules";

export const cloudFolderDestination: IExportDestination = {
  kind: "cloud_folder",

  async export(bundle: ExportBundle, options?: ExportDestinationOptions): Promise<{ ok: boolean; kind: "cloud_folder"; storageKey?: string; fileName?: string; error?: string }> {
    try {
      const zipBuffer = await buildCasePacketZipFromBundle(bundle);
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      let prefix = (options?.cloudPathPrefix as string)?.trim();
      if (!prefix) {
        const rules = await getFirmExportNamingRules(bundle.firmId);
        const caseCtx = buildDocumentNamingContext(
          bundle.case,
          { id: "", originalName: null },
          null,
          bundle.exportedAt
        );
        const folderPath = rules ? applyFolderPattern(rules, caseCtx) : "";
        prefix = folderPath
          ? `${bundle.firmId}/exports/${folderPath}`
          : `${bundle.firmId}/exports/cases/${bundle.caseId}`;
      } else {
        prefix = prefix.startsWith(bundle.firmId + "/") ? prefix : `${bundle.firmId}/exports/${prefix.replace(/^\//, "")}`;
      }
      const fileName = `case-packet-${ts}.zip`;
      const key = `${prefix.replace(/\/$/, "")}/${fileName}`;
      await putObject(key, zipBuffer, "application/zip");
      return {
        ok: true,
        kind: "cloud_folder",
        storageKey: key,
        fileName,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { ok: false, kind: "cloud_folder", error };
    }
  },
};
