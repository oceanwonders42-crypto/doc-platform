/**
 * Drive adapters for cloud-drive style export.
 * Implement IDriveAdapter for other backends (e.g. Google Drive, OneDrive) in the future.
 */

export type { IDriveAdapter, DrivePutResult } from "./types";
export { createS3DriveAdapter } from "./s3DriveAdapter";
