import { prisma } from "../db/prisma";
import { getClioConfig } from "./clioConfig";

const CLIO_API_BASE = process.env.CLIO_API_BASE_URL || "https://app.clio.com/api/v4";
const DEFAULT_STALE_AFTER_MS = 60_000;
const MAX_CASES_PER_SYNC = 25;

type ClioMatterAssignment = {
  responsibleAttorneyId: string | null;
  responsibleAttorneyEmail: string | null;
};

export type SyncClioCaseAssignmentsParams = {
  firmId: string;
  caseIds?: string[];
  force?: boolean;
  staleAfterMs?: number;
  limit?: number;
};

export type SyncClioCaseAssignmentsResult = {
  ok: boolean;
  syncedCount: number;
  skippedCount: number;
  skippedReason?: string;
  errors: Array<{ caseId: string; error: string }>;
};

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildClioMatterUrl(externalMatterId: string): string {
  const url = new URL(`${CLIO_API_BASE.replace(/\/$/, "")}/matters/${encodeURIComponent(externalMatterId)}.json`);
  url.searchParams.set(
    "fields",
    "id,responsible_attorney_id,responsible_attorney{id,email}"
  );
  return String(url);
}

async function readClioError(response: Response): Promise<string> {
  const text = (await response.text()).trim();
  return text ? text.slice(0, 300) : "No response body";
}

async function fetchClioMatterAssignment(
  accessToken: string,
  externalMatterId: string
): Promise<{ ok: true; assignment: ClioMatterAssignment } | { ok: false; error: string }> {
  const response = await fetch(buildClioMatterUrl(externalMatterId), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    return {
      ok: false,
      error: `Clio matter lookup failed: ${response.status} ${await readClioError(response)}`,
    };
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const data = asRecord(asRecord(payload)?.data);
  const responsibleAttorney = asRecord(data?.responsible_attorney);

  return {
    ok: true,
    assignment: {
      responsibleAttorneyId:
        normalizeString(responsibleAttorney?.id) ?? normalizeString(data?.responsible_attorney_id),
      responsibleAttorneyEmail: normalizeEmail(responsibleAttorney?.email),
    },
  };
}

export async function syncClioCaseAssignmentsIfStale(
  params: SyncClioCaseAssignmentsParams
): Promise<SyncClioCaseAssignmentsResult> {
  const staleAfterMs = params.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const syncLimit = Math.max(1, Math.min(params.limit ?? MAX_CASES_PER_SYNC, MAX_CASES_PER_SYNC));
  const requestedCaseIds = Array.isArray(params.caseIds)
    ? [...new Set(params.caseIds.map((value) => value.trim()).filter(Boolean))]
    : [];

  const config = await getClioConfig(params.firmId);
  if (!config.configured) {
    return {
      ok: false,
      syncedCount: 0,
      skippedCount: 0,
      skippedReason: "Clio integration is not configured for this firm.",
      errors: [],
    };
  }

  const [mappings, cases, users] = await Promise.all([
    prisma.crmCaseMapping.findMany({
      where: {
        firmId: params.firmId,
        ...(requestedCaseIds.length > 0 ? { caseId: { in: requestedCaseIds } } : {}),
      },
      select: { caseId: true, externalMatterId: true },
    }),
    prisma.legalCase.findMany({
      where: {
        firmId: params.firmId,
        ...(requestedCaseIds.length > 0 ? { id: { in: requestedCaseIds } } : {}),
      },
      select: {
        id: true,
        clioAssignmentSyncedAt: true,
      },
    }),
    prisma.user.findMany({
      where: { firmId: params.firmId },
      select: { id: true, email: true },
    }),
  ]);

  if (mappings.length === 0) {
    return {
      ok: true,
      syncedCount: 0,
      skippedCount: requestedCaseIds.length,
      skippedReason: requestedCaseIds.length > 0 ? "No mapped Clio matters found for the requested cases." : "No mapped Clio matters found for this firm.",
      errors: [],
    };
  }

  const caseById = new Map(cases.map((item) => [item.id, item]));
  const userIdByEmail = new Map(
    users
      .map((user) => [normalizeEmail(user.email), user.id] as const)
      .filter((entry): entry is readonly [string, string] => entry[0] != null)
  );
  const staleBefore = Date.now() - staleAfterMs;
  const targets = mappings
    .map((mapping) => ({
      caseId: mapping.caseId,
      externalMatterId: mapping.externalMatterId.trim(),
      clioAssignmentSyncedAt: caseById.get(mapping.caseId)?.clioAssignmentSyncedAt ?? null,
    }))
    .filter((item) => item.externalMatterId)
    .filter((item) => {
      if (params.force) return true;
      if (!item.clioAssignmentSyncedAt) return true;
      return item.clioAssignmentSyncedAt.getTime() < staleBefore;
    })
    .slice(0, syncLimit);

  if (targets.length === 0) {
    return {
      ok: true,
      syncedCount: 0,
      skippedCount: mappings.length,
      skippedReason: "Clio case assignments are already fresh.",
      errors: [],
    };
  }

  let syncedCount = 0;
  const errors: Array<{ caseId: string; error: string }> = [];

  for (const target of targets) {
    const assignmentResult = await fetchClioMatterAssignment(
      config.accessToken,
      target.externalMatterId
    );
    if (!assignmentResult.ok) {
      errors.push({ caseId: target.caseId, error: assignmentResult.error });
      continue;
    }

    const assignedUserId = assignmentResult.assignment.responsibleAttorneyEmail
      ? userIdByEmail.get(assignmentResult.assignment.responsibleAttorneyEmail) ?? null
      : null;

    await prisma.legalCase.updateMany({
      where: { id: target.caseId, firmId: params.firmId },
      data: {
        assignedUserId,
        clioResponsibleAttorneyId: assignmentResult.assignment.responsibleAttorneyId,
        clioResponsibleAttorneyEmail: assignmentResult.assignment.responsibleAttorneyEmail,
        clioAssignmentSyncedAt: new Date(),
      },
    });
    syncedCount += 1;
  }

  return {
    ok: errors.length === 0,
    syncedCount,
    skippedCount: Math.max(mappings.length - targets.length, 0),
    errors,
  };
}
