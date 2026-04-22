/**
 * Email packet destination: build ZIP and send as email attachment.
 * Uses shared send adapter (SMTP). Options: emailTo (required), emailSubject.
 */

import type { IExportDestination } from "./types";
import type { ExportBundle } from "../contract";
import type { ExportDestinationOptions } from "./types";
import { buildCasePacketZipFromBundle } from "../../casePacketExport";
import { sendAdapter } from "../../../send/compositeAdapter";

export const emailPacketDestination: IExportDestination = {
  kind: "email_packet",

  async export(bundle: ExportBundle, options?: ExportDestinationOptions): Promise<{ ok: boolean; kind: "email_packet"; error?: string }> {
    const to = (options?.emailTo as string)?.trim();
    if (!to) {
      return { ok: false, kind: "email_packet", error: "emailTo is required for email_packet destination" };
    }

    try {
      const zipBuffer = await buildCasePacketZipFromBundle(bundle);
      const ts = bundle.exportedAt.slice(0, 10);
      const caseLabel = [bundle.case.caseNumber, bundle.case.clientName].filter(Boolean).join(" — ") || bundle.caseId;
      const subject = (options?.emailSubject as string)?.trim() || `Case packet: ${caseLabel} (${ts})`;
      const body = `Case packet export for ${caseLabel}.\n\nDocuments: ${bundle.documents.length} file(s).\nExported at ${bundle.exportedAt}.`;

      const result = await sendAdapter.sendEmail(to, subject, body, [
        { filename: `case-packet-${ts}.zip`, content: zipBuffer, contentType: "application/zip" },
      ]);

      if (result.ok) {
        return { ok: true, kind: "email_packet" };
      }
      return { ok: false, kind: "email_packet", error: result.error };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { ok: false, kind: "email_packet", error };
    }
  },
};
