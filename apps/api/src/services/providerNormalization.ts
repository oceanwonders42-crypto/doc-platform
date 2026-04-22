/**
 * Provider normalization and alias-aware resolution.
 * Standardizes provider strings for matching; supports unresolved state and future alias maps.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";

export type ProviderResolutionStatus = "resolved" | "unresolved";

export type ResolvedProvider =
  | { resolved: true; providerId: string; canonicalName: string; normalizedName: string }
  | { resolved: false; normalizedName: string; rawName: string };

const CREDENTIALS_SUFFIX = /\s*,?\s*(?:MD|DO|NP|PA|RN|PT|OT|LPN|APRN|PhD|DDS|DMD|DO\.?|MD\.?)\s*\.?$/gi;
const ENTITY_SUFFIXES = /\s*,?\s*(?:Inc\.?|LLC|LLP|P\.?A\.?|P\.?C\.?|Ltd\.?|Co\.?)\s*\.?$/gi;
const MULTI_SPACE = /\s+/g;

/**
 * Normalize a provider string for display and storage.
 * Preserves readability; strips credentials and entity suffixes.
 */
export function normalizeProviderDisplayName(raw: string | null | undefined): string {
  if (raw == null) return "";
  let s = String(raw).replace(MULTI_SPACE, " ").trim();
  if (!s) return "";
  s = s.replace(CREDENTIALS_SUFFIX, "").replace(ENTITY_SUFFIXES, "").replace(MULTI_SPACE, " ").trim();
  return s.slice(0, 200);
}

/**
 * Produce a stable key for matching. Aggressive normalization to avoid over-merging:
 * only exact matches on this key (or explicit aliases) resolve.
 */
export function normalizeProviderMatchKey(raw: string | null | undefined): string {
  if (raw == null) return "";
  const display = normalizeProviderDisplayName(raw);
  return display
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 100);
}

/** Minimum length of match key to allow substring/contains matching; shorter names require exact match only. */
const MIN_KEY_LENGTH_FOR_CONTAINS = 12;

/**
 * Resolve a raw provider name to a firm Provider (or unresolved).
 * Uses normalized display name and match key; supports alias table; avoids over-merging.
 */
export async function resolveProvider(
  firmId: string,
  rawName: string | null | undefined
): Promise<ResolvedProvider> {
  const raw = rawName?.trim() ?? "";
  if (!raw || raw.length < 2) {
    return { resolved: false, normalizedName: "", rawName: raw };
  }

  const normalizedName = normalizeProviderDisplayName(raw);
  if (!normalizedName) return { resolved: false, normalizedName: "", rawName: raw };

  const matchKey = normalizeProviderMatchKey(raw);
  if (matchKey.length < 2) return { resolved: false, normalizedName, rawName: raw };

  const providers = await prisma.provider.findMany({
    where: { firmId, listingActive: true },
    select: { id: true, name: true },
  });

  let aliasMap: Map<string, { providerId: string; canonicalName: string }> = new Map();
  try {
    const { rows } = await pgPool.query<{ provider_id: string; name: string; alias_normalized: string }>(
      `SELECT a.provider_id, p.name, a.alias_normalized
       FROM provider_alias a
       JOIN "Provider" p ON p.id = a.provider_id AND p."firmId" = $1
       WHERE a.firm_id = $1`,
      [firmId]
    );
    for (const r of rows) {
      const key = (r.alias_normalized || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 100);
      if (key) aliasMap.set(key, { providerId: r.provider_id, canonicalName: r.name ?? r.provider_id });
    }
  } catch {
    // provider_alias table may not exist yet
  }

  for (const p of providers) {
    const canonicalNorm = normalizeProviderMatchKey(p.name);
    if (canonicalNorm === matchKey) {
      return { resolved: true, providerId: p.id, canonicalName: p.name, normalizedName };
    }
    if (aliasMap.get(matchKey)?.providerId === p.id) {
      return { resolved: true, providerId: p.id, canonicalName: p.name, normalizedName };
    }
  }

  for (const p of providers) {
    const canonicalNorm = normalizeProviderMatchKey(p.name);
    const keyLen = matchKey.length;
    const canonLen = canonicalNorm.length;
    if (keyLen >= MIN_KEY_LENGTH_FOR_CONTAINS && canonLen >= MIN_KEY_LENGTH_FOR_CONTAINS) {
      if (canonicalNorm.includes(matchKey) || matchKey.includes(canonicalNorm)) {
        return { resolved: true, providerId: p.id, canonicalName: p.name, normalizedName };
      }
    }
  }

  return { resolved: false, normalizedName, rawName: raw };
}
