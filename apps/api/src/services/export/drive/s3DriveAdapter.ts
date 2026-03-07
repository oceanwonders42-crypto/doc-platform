/**
 * S3/Spaces drive adapter: writes files under {firmId}/drive/ using existing object storage.
 * Compatible with MinIO and S3-compatible endpoints (e.g. DigitalOcean Spaces).
 */

import { putObject } from "../../storage";
import type { IDriveAdapter } from "./types";

const SAFE_PATH_REGEX = /^[\w\s\-\.\/]+$/;

function sanitizeRelativePath(relativePath: string): string {
  const trimmed = relativePath.replace(/\\/g, "/").trim();
  if (!SAFE_PATH_REGEX.test(trimmed)) {
    return trimmed
      .split("/")
      .map((seg) => seg.replace(/[^\w\s\-\.]/g, "").trim() || "file")
      .filter(Boolean)
      .join("/");
  }
  return trimmed;
}

export function createS3DriveAdapter(firmId: string, pathPrefix = "drive"): IDriveAdapter {
  const basePrefix = `${firmId}/${pathPrefix}`.replace(/\/+/g, "/");

  return {
    async putFile(relativePath: string, buffer: Buffer, mimeType: string): Promise<{ key: string }> {
      const safe = sanitizeRelativePath(relativePath);
      if (!safe) throw new Error("Invalid drive path");
      const key = `${basePrefix}/${safe}`.replace(/\/+/g, "/");
      await putObject(key, buffer, mimeType || "application/octet-stream");
      return { key };
    },
  };
}
