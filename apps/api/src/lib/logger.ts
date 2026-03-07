/**
 * Structured operational logging for API and worker.
 * Outputs JSON lines: { ts, level, message, requestId?, ...meta } for debugging production.
 */

export type LogLevel = "info" | "warn" | "error";

function formatLine(level: LogLevel, message: string, meta?: Record<string, unknown> | null): string {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message: String(message).slice(0, 2000),
  };
  if (meta && typeof meta === "object") {
    for (const [k, v] of Object.entries(meta)) {
      if (v === undefined) continue;
      payload[k] = v;
    }
  }
  return JSON.stringify(payload);
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown> | null): void {
  const line = formatLine(level, message, meta);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(message: string, meta?: Record<string, unknown> | null): void {
  log("info", message, meta);
}

export function logWarn(message: string, meta?: Record<string, unknown> | null): void {
  log("warn", message, meta);
}

export function logError(message: string, meta?: Record<string, unknown> | null): void {
  log("error", message, meta);
}

/** Log from API with requestId attached when available. */
export function requestLog(
  req: { requestId?: string },
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown> | null
): void {
  const requestId = (req as { requestId?: string }).requestId;
  const fullMeta = requestId ? { requestId, ...meta } : meta;
  log(level, message, fullMeta ?? undefined);
}
