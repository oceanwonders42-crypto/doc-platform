/**
 * Firm-level Clio connection config. Resolves access token from firm.settings
 * (either crmIntegrationId -> IntegrationCredential or legacy clioAccessToken).
 * Used by clioAdapter and crmAdapter.
 */
import { prisma } from "../db/prisma";
import { decryptSecret } from "./credentialEncryption";

export type ClioConfigResult =
  | {
      configured: true;
      accessToken: string;
      claimNumberCustomFieldId: string | null;
      integrationId: string | null;
      sandbox: ClioSandboxConfig | null;
    }
  | { configured: false; error?: string };

type ClioCredentialPayload = {
  accessToken?: unknown;
  apiKey?: unknown;
  token?: unknown;
  sandboxMode?: unknown;
  sandboxLabel?: unknown;
};

export type ClioSandboxConfig = {
  mode: "local_case_api";
  label: string | null;
};

type ClioFieldMappingRow = {
  sourceField: string;
  targetField: string;
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

function normalizeFieldMappingKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function resolveClaimNumberCustomFieldId(
  settings: Record<string, unknown>,
  fieldMappings: ClioFieldMappingRow[]
): string | null {
  const mapping = fieldMappings.find((entry) => {
    const key = normalizeFieldMappingKey(entry.sourceField);
    return key === "claimnumber" || key === "claim";
  });
  const mappedFieldId = normalizeString(mapping?.targetField);
  if (mappedFieldId) {
    return mappedFieldId;
  }

  const settingCandidates = [
    settings.clioClaimNumberCustomFieldId,
    settings.clioClaimNumberFieldId,
    settings.claimNumberCustomFieldId,
    settings.claimNumberFieldId,
  ];
  for (const candidate of settingCandidates) {
    const normalized = normalizeString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function resolveAccessTokenFromCredential(payload: ClioCredentialPayload): string | null {
  const candidates = [payload.accessToken, payload.apiKey, payload.token];
  for (const candidate of candidates) {
    const normalized = normalizeString(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function resolveSandboxConfigFromCredential(payload: ClioCredentialPayload): ClioSandboxConfig | null {
  const sandboxMode = normalizeString(payload.sandboxMode);
  if (sandboxMode !== "local_case_api") {
    return null;
  }

  return {
    mode: "local_case_api",
    label: normalizeString(payload.sandboxLabel),
  };
}

/**
 * Get Clio config for the firm. Prefers encrypted credentials via crmIntegrationId;
 * falls back to firm.settings.clioAccessToken.
 */
export async function getClioConfig(firmId: string): Promise<ClioConfigResult> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings = (firm?.settings ?? {}) as Record<string, unknown>;

  if (settings.crm !== "clio") {
    return { configured: false, error: "Firm CRM is not Clio" };
  }

  const integrationId = settings.crmIntegrationId as string | undefined;
  if (integrationId && typeof integrationId === "string") {
    const integration = await prisma.firmIntegration.findFirst({
      where: { id: integrationId, firmId },
      include: {
        credentials: { take: 1 },
        fieldMappings: {
          select: {
            sourceField: true,
            targetField: true,
          },
        },
      },
    });
    const cred = integration?.credentials?.[0];
    const claimNumberCustomFieldId = resolveClaimNumberCustomFieldId(
      settings,
      integration?.fieldMappings ?? []
    );
    if (cred?.encryptedSecret) {
      try {
        const parsed = JSON.parse(decryptSecret(cred.encryptedSecret)) as ClioCredentialPayload;
        const token = resolveAccessTokenFromCredential(parsed);
        if (token) {
          return {
            configured: true,
            accessToken: token,
            claimNumberCustomFieldId,
            integrationId: integration?.id ?? null,
            sandbox: resolveSandboxConfigFromCredential(parsed),
          };
        }
      } catch {
        return { configured: false, error: "Failed to decrypt Clio credential" };
      }
    }
    return { configured: false, error: "Clio integration has no credential" };
  }

  const legacyToken = settings.clioAccessToken as string | undefined;
  if (legacyToken && typeof legacyToken === "string" && legacyToken.trim()) {
    return {
      configured: true,
      accessToken: legacyToken.trim(),
      claimNumberCustomFieldId: resolveClaimNumberCustomFieldId(settings, []),
      integrationId: null,
      sandbox: null,
    };
  }

  return { configured: false, error: "Clio OAuth token not configured" };
}

export async function getClioAccessToken(firmId: string): Promise<ClioConfigResult> {
  return getClioConfig(firmId);
}
