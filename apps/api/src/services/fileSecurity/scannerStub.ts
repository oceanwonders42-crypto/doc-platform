/**
 * Stub for future antivirus/malware integration. No real scan; returns accepted.
 */
import type { FileScanResult } from "./types";

export async function scanBuffer(
  _buffer: Buffer,
  _filename: string,
  _mimeType: string | null
): Promise<FileScanResult> {
  return { accepted: true, ok: true, scannerUsed: "stub" };
}
