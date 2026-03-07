/**
 * Basic IP / abuse tracking for visibility and thresholding.
 * Tracks: auth failures, rate-limit hits, suspicious uploads, invalid payload abuse.
 * When threshold exceeded, logs to SystemErrorLog (area: security). No hard block yet.
 */
import { logSystemError } from "./errorLog";

export type AbuseEventType =
  | "auth_failure"
  | "rate_limit_hit"
  | "suspicious_upload"
  | "invalid_payload"
  | "tenant_mismatch";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const THRESHOLD = 10; // after this many events in window, log to SystemErrorLog
const MAX_ENTRIES = 5000;

interface AbuseEntry {
  ip: string;
  route: string;
  eventType: AbuseEventType;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

const store = new Map<string, AbuseEntry>();

function key(ip: string, route: string, eventType: AbuseEventType): string {
  return `${ip}:${route}:${eventType}`;
}

/**
 * Record an abuse-related event. Call from auth failure, rate limit 429, upload reject, validation 400.
 */
export function recordAbuse(opts: {
  ip: string;
  route: string;
  eventType: AbuseEventType;
}): void {
  const { ip, route, eventType } = opts;
  const k = key(ip, route, eventType);
  const now = Date.now();
  let entry = store.get(k);
  if (!entry) {
    if (store.size >= MAX_ENTRIES) {
      // Evict oldest by lastSeenAt
      const oldest = [...store.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)[0];
      if (oldest) store.delete(oldest[0]);
    }
    entry = { ip, route, eventType, count: 0, firstSeenAt: now, lastSeenAt: now };
    store.set(k, entry);
  }
  if (now - entry.firstSeenAt > WINDOW_MS) {
    entry.count = 0;
    entry.firstSeenAt = now;
  }
  entry.count += 1;
  entry.lastSeenAt = now;

  if (entry.count >= THRESHOLD) {
    logSystemError(
      "api",
      `Abuse threshold exceeded: ${eventType} from IP ${ip} on ${route} (count=${entry.count})`,
      undefined,
      {
        area: "security",
        route,
        method: "ABUSE",
        severity: "WARN",
        metaJson: {
          ip,
          eventType,
          count: entry.count,
          firstSeenAt: new Date(entry.firstSeenAt).toISOString(),
          lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
        },
        status: "OPEN",
      }
    ).catch(() => {});
    // Reset so we don't log every request
    entry.count = 0;
    entry.firstSeenAt = now;
  }
}

export type AbuseStats = {
  rateLimitHitCount: number;
  suspiciousUploadCount: number;
  authFailureCount: number;
  invalidPayloadCount: number;
  recentAbuseByIp: Array<{ ip: string; route: string; eventType: AbuseEventType; count: number; lastSeenAt: string }>;
};

/**
 * Return counts and recent abuse for admin/health. Counts are over the rolling window.
 */
export function getAbuseStats(): AbuseStats {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  let rateLimitHitCount = 0;
  let suspiciousUploadCount = 0;
  let authFailureCount = 0;
  let invalidPayloadCount = 0;
  const recent: AbuseStats["recentAbuseByIp"] = [];

  for (const [, entry] of store) {
    if (entry.lastSeenAt < cutoff) continue;
    switch (entry.eventType) {
      case "rate_limit_hit":
        rateLimitHitCount += entry.count;
        break;
      case "suspicious_upload":
        suspiciousUploadCount += entry.count;
        break;
      case "auth_failure":
        authFailureCount += entry.count;
        break;
      case "invalid_payload":
        invalidPayloadCount += entry.count;
        break;
    }
    recent.push({
      ip: entry.ip,
      route: entry.route,
      eventType: entry.eventType,
      count: entry.count,
      lastSeenAt: new Date(entry.lastSeenAt).toISOString(),
    });
  }
  recent.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
  return {
    rateLimitHitCount,
    suspiciousUploadCount,
    authFailureCount,
    invalidPayloadCount,
    recentAbuseByIp: recent.slice(0, 50),
  };
}
