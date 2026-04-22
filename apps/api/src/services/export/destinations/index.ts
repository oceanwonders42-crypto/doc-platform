/**
 * Registry of export destinations. Add new CRM adapters by implementing IExportDestination
 * and registering here under the same "crm" kind or a new kind.
 */

import type { ExportDestinationKind } from "./types";
import type { IExportDestination } from "./types";
import { downloadBundleDestination } from "./downloadBundle";
import { cloudFolderDestination } from "./cloudFolder";
import { cloudDriveDestination } from "./cloudDrive";
import { crmDestination } from "./crmAdapter";
import { emailPacketDestination } from "./emailPacket";

const byKind: Record<ExportDestinationKind, IExportDestination> = {
  download_bundle: downloadBundleDestination,
  cloud_folder: cloudFolderDestination,
  cloud_drive: cloudDriveDestination,
  crm: crmDestination,
  email_packet: emailPacketDestination,
};

export function getExportDestination(kind: ExportDestinationKind): IExportDestination {
  const d = byKind[kind];
  if (!d) throw new Error(`Unknown export destination: ${kind}`);
  return d;
}

export function getSupportedDestinationKinds(): ExportDestinationKind[] {
  return ["download_bundle", "cloud_folder", "cloud_drive", "crm", "email_packet"];
}

export { downloadBundleDestination, cloudFolderDestination, cloudDriveDestination, crmDestination, emailPacketDestination };
