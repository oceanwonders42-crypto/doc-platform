/**
 * Drive adapter interface for cloud-drive style export.
 * Implementations write files into an organized folder structure (e.g. S3, future Google Drive/OneDrive).
 * All paths are relative to a firm-scoped base; the adapter is responsible for tenant isolation.
 */

export type DrivePutResult = {
  /** Full storage key/path of the written file (for display or linking). */
  key: string;
};

export interface IDriveAdapter {
  /**
   * Write a file at the given relative path (e.g. "Case-123/Medical/document.pdf").
   * Path segments should use forward slashes; adapter must not allow path escape.
   * @param relativePath Path relative to the drive base (firm-scoped).
   * @param buffer File contents.
   * @param mimeType Content-Type (e.g. application/pdf).
   */
  putFile(relativePath: string, buffer: Buffer, mimeType: string): Promise<DrivePutResult>;
}
