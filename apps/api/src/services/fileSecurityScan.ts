/**
 * File security scan — re-export from fileSecurity module for backward compatibility.
 * validateUploadFile is async (runs stub scanner); use await.
 */
export { validateUploadFile } from "./fileSecurity/index";
export {
  validateUploadFileLegacy,
  validateUploadFileSync,
  validateFileType,
  validateSize,
  MAX_UPLOAD_BYTES,
} from "./fileSecurity/index";
export type { FileScanResult } from "./fileSecurity/types";
