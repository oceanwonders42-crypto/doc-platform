/**
 * File security scan types. Structured result for validation and future antivirus integration.
 */
export type ScanSeverity = "low" | "medium" | "high" | "critical";

export type FileScanResult =
  | { accepted: true; ok: true; scannerUsed?: string }
  | {
      accepted: false;
      ok: false;
      reason: string;
      severity?: ScanSeverity;
      scannerUsed?: string;
      quarantine?: boolean;
    };

/** Backward-compatible shape: ok + reason for existing callers. */
export function toLegacyResult(r: FileScanResult): { ok: true } | { ok: false; reason: string; quarantine?: boolean } {
  if (r.accepted) return { ok: true };
  return {
    ok: false,
    reason: r.reason,
    ...(r.quarantine !== undefined && { quarantine: r.quarantine }),
  };
}
