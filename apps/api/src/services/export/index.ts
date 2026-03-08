/**
 * CRM-agnostic export layer: unified contract and destinations.
 * Use after document processing is complete. Supports: CRM adapter, cloud folder, email packet, manual download bundle.
 */

export type { ExportBundle, ExportDocumentRef, BuildExportBundleOptions } from "./contract";
export { buildExportBundle } from "./contract";

export type { ExportDestinationKind, ExportResult, ExportDestinationOptions, IExportDestination } from "./destinations/types";
export { getExportDestination, getSupportedDestinationKinds } from "./destinations";

export type { RunExportParams, RunExportResult } from "./runExport";
export { runExport } from "./runExport";

export type { ExportNamingRules, NamingContext } from "./namingRules";
export {
  getFirmExportNamingRules,
  setFirmExportNamingRules,
  applyFilePattern,
  applyFolderPattern,
  getFolderForDocType,
  buildDocumentNamingContext,
  getRecognitionForDocument,
} from "./namingRules";
