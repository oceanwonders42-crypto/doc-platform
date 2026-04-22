/**
 * Export destination kinds and result contract.
 * New CRM adapters plug in by implementing IExportDestination for kind "crm".
 */

import type { ExportBundle } from "../contract";

export type ExportDestinationKind = "crm" | "cloud_folder" | "cloud_drive" | "email_packet" | "download_bundle";

export type ExportResult = {
  ok: boolean;
  kind: ExportDestinationKind;
  externalId?: string;
  storageKey?: string;
  fileName?: string;
  /** For cloud_drive: number of files written */
  filesWritten?: number;
  error?: string;
};

export type ExportDestinationOptions = {
  /** For email_packet: recipient address */
  emailTo?: string;
  /** For email_packet: subject line */
  emailSubject?: string;
  /** For cloud_folder: optional path prefix (default firmId/exports/cases/caseId/) */
  cloudPathPrefix?: string;
  /** For cloud_drive: optional path prefix under firmId/drive/ (e.g. "exports" or "2025-01") */
  cloudDrivePathPrefix?: string;
  /** For download_bundle: packet type for file name and CasePacketExport record (records | bills | combined) */
  packetType?: "records" | "bills" | "combined";
  [key: string]: unknown;
};

export interface IExportDestination {
  readonly kind: ExportDestinationKind;
  export(bundle: ExportBundle, options?: ExportDestinationOptions): Promise<ExportResult>;
}
