import crypto from "crypto";
import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { decryptSecret, encryptSecret } from "./credentialEncryption";

const CLIO_AUTHORIZE_URL =
  process.env.CLIO_OAUTH_AUTHORIZE_URL?.trim() ||
  "https://app.clio.com/oauth/authorize";
const CLIO_TOKEN_URL =
  process.env.CLIO_OAUTH_TOKEN_URL?.trim() || "https://app.clio.com/oauth/token";
const CLIO_DEAUTHORIZE_URL =
  process.env.CLIO_OAUTH_DEAUTHORIZE_URL?.trim() ||
  "https://app.clio.com/oauth/deauthorize";
const CLIO_WHO_AM_I_URL =
  process.env.CLIO_OAUTH_WHO_AM_I_URL?.trim() ||
  "https://app.clio.com/api/v4/users/who_am_i";
const CLIO_STATE_MAX_AGE_MS = 15 * 60 * 1000;

type ClioOAuthEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  missingEnvVars: string[];
};

type ClioOAuthStatePayload = {
  firmId: string;
  userId: string | null;
  nonce: string;
  createdAt: string;
};

type ClioTokenResponse = {
  token_type?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type ClioWhoAmIResponse = {
  data?: {
    id?: string | number;
    name?: string;
    email?: string;
  };
};

type StoredClioCredential = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresAt?: string | null;
  connectedAt: string;
  connectedByUserId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  accountEmail?: string | null;
};

export type ClioConnectionStatus = {
  envConfigured: boolean;
  missingEnvVars: string[];
  connected: boolean;
  firmId: string;
  integrationId: string | null;
  status: IntegrationStatus | "DISCONNECTED";
  accountName: string | null;
  accountEmail: string | null;
  connectedByUserId: string | null;
  updatedAt: string | null;
  redirectUri: string | null;
};

export class ClioOAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "ClioOAuthError";
    this.statusCode = statusCode;
  }
}

function getClioOAuthEnv(): ClioOAuthEnv {
  const clientId =
    process.env.CLIO_OAUTH_CLIENT_ID?.trim() ||
    process.env.CLIO_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    process.env.CLIO_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.CLIO_CLIENT_SECRET?.trim() ||
    "";
  const redirectUri = process.env.CLIO_OAUTH_REDIRECT_URI?.trim() || "";

  const missingEnvVars: string[] = [];
  if (!clientId) missingEnvVars.push("CLIO_OAUTH_CLIENT_ID");
  if (!clientSecret) missingEnvVars.push("CLIO_OAUTH_CLIENT_SECRET");
  if (!redirectUri) missingEnvVars.push("CLIO_OAUTH_REDIRECT_URI");

  if (missingEnvVars.length > 0) {
    throw new ClioOAuthError("Clio OAuth env is not fully configured.", 500);
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    missingEnvVars: [],
  };
}

export function getClioEnvStatus(): {
  configured: boolean;
  missingEnvVars: string[];
  redirectUri: string | null;
} {
  try {
    const env = getClioOAuthEnv();
    return {
      configured: true,
      missingEnvVars: [],
      redirectUri: env.redirectUri,
    };
  } catch (error) {
    if (error instanceof ClioOAuthError) {
      const redirectUri = process.env.CLIO_OAUTH_REDIRECT_URI?.trim() || null;
      return {
        configured: false,
        missingEnvVars: [
          ...(process.env.CLIO_OAUTH_CLIENT_ID?.trim() ||
          process.env.CLIO_CLIENT_ID?.trim()
            ? []
            : ["CLIO_OAUTH_CLIENT_ID"]),
          ...(process.env.CLIO_OAUTH_CLIENT_SECRET?.trim() ||
          process.env.CLIO_CLIENT_SECRET?.trim()
            ? []
            : ["CLIO_OAUTH_CLIENT_SECRET"]),
          ...(redirectUri ? [] : ["CLIO_OAUTH_REDIRECT_URI"]),
        ],
        redirectUri,
      };
    }
    return {
      configured: false,
      missingEnvVars: [
        "CLIO_OAUTH_CLIENT_ID",
        "CLIO_OAUTH_CLIENT_SECRET",
        "CLIO_OAUTH_REDIRECT_URI",
      ],
      redirectUri: process.env.CLIO_OAUTH_REDIRECT_URI?.trim() || null,
    };
  }
}

function getStateSigningSecret(env: ClioOAuthEnv): string {
  return process.env.JWT_SECRET?.trim() || env.clientSecret;
}

function createSignedStateCookie(
  payload: ClioOAuthStatePayload,
  env: ClioOAuthEnv
): string {
  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8"
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getStateSigningSecret(env))
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function parseSignedStateCookie(
  value: string | undefined,
  env: ClioOAuthEnv
): ClioOAuthStatePayload | null {
  if (!value || !value.includes(".")) return null;
  const [encodedPayload, signature] = value.split(".", 2);
  if (!encodedPayload || !signature) return null;
  const expectedSignature = crypto
    .createHmac("sha256", getStateSigningSecret(env))
    .update(encodedPayload)
    .digest("base64url");
  if (signature !== expectedSignature) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as ClioOAuthStatePayload;
    if (!parsed.firmId || !parsed.nonce || !parsed.createdAt) return null;
    const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > CLIO_STATE_MAX_AGE_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function extractClioError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Clio request failed.";
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.error_description === "string" &&
    record.error_description.trim()
  ) {
    return record.error_description.trim();
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }

  return "Clio request failed.";
}

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

function asInputJsonObject(
  value: Record<string, unknown>
): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function buildStoredClioCredential(input: {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: Date | null;
  connectedAt: Date;
  connectedByUserId: string | null;
  accountId: string | null;
  accountName: string | null;
  accountEmail: string | null;
}): StoredClioCredential {
  return {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tokenType: input.tokenType,
    expiresAt: input.expiresAt?.toISOString() ?? null,
    connectedAt: input.connectedAt.toISOString(),
    connectedByUserId: input.connectedByUserId,
    accountId: input.accountId,
    accountName: input.accountName,
    accountEmail: input.accountEmail,
  };
}

function parseStoredClioCredential(
  encryptedSecret: string
): StoredClioCredential {
  const parsed = JSON.parse(
    decryptSecret(encryptedSecret)
  ) as Partial<StoredClioCredential>;
  if (!parsed.accessToken || !parsed.connectedAt) {
    throw new ClioOAuthError("Stored Clio credential is incomplete.", 500);
  }

  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken ?? null,
    tokenType: parsed.tokenType ?? null,
    expiresAt: parsed.expiresAt ?? null,
    connectedAt: parsed.connectedAt,
    connectedByUserId: parsed.connectedByUserId ?? null,
    accountId: parsed.accountId ?? null,
    accountName: parsed.accountName ?? null,
    accountEmail: parsed.accountEmail ?? null,
  };
}

async function exchangeCodeForTokens(params: {
  code: string;
  env: ClioOAuthEnv;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: Date | null;
}> {
  const body = new URLSearchParams({
    client_id: params.env.clientId,
    client_secret: params.env.clientSecret,
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.env.redirectUri,
  });

  const response = await fetch(CLIO_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as
    | ClioTokenResponse
    | null;
  if (!response.ok || !payload) {
    throw new ClioOAuthError(extractClioError(payload), response.status || 502);
  }

  const accessToken = normalizeString(payload.access_token);
  if (!accessToken) {
    throw new ClioOAuthError(
      "Clio token exchange did not return an access token.",
      502
    );
  }

  const refreshToken = normalizeString(payload.refresh_token);
  const tokenType = normalizeString(payload.token_type);
  const expiresIn =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : null;

  return {
    accessToken,
    refreshToken,
    tokenType,
    expiresAt: expiresIn != null ? new Date(Date.now() + expiresIn * 1000) : null,
  };
}

async function fetchClioWhoAmI(accessToken: string): Promise<{
  accountId: string | null;
  accountName: string | null;
  accountEmail: string | null;
}> {
  const response = await fetch(CLIO_WHO_AM_I_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | ClioWhoAmIResponse
    | null;
  if (!response.ok || !payload) {
    throw new ClioOAuthError(extractClioError(payload), response.status || 502);
  }

  return {
    accountId: normalizeString(payload.data?.id),
    accountName: normalizeString(payload.data?.name),
    accountEmail: normalizeString(payload.data?.email),
  };
}

async function findClioIntegration(firmId: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { settings: true },
  });
  const settings =
    firm?.settings && typeof firm.settings === "object" && !Array.isArray(firm.settings)
      ? (firm.settings as Record<string, unknown>)
      : {};

  const preferredId = normalizeString(settings.crmIntegrationId);
  if (preferredId) {
    const integration = await prisma.firmIntegration.findFirst({
      where: {
        id: preferredId,
        firmId,
        provider: IntegrationProvider.CLIO,
        type: IntegrationType.CASE_API,
      },
      include: {
        credentials: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (integration) {
      return { integration, settings };
    }
  }

  const integration = await prisma.firmIntegration.findFirst({
    where: {
      firmId,
      provider: IntegrationProvider.CLIO,
      type: IntegrationType.CASE_API,
    },
    include: {
      credentials: {
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return { integration, settings };
}

export function beginClioOAuthConnect(params: {
  firmId: string;
  userId: string | null;
}): { authorizeUrl: string; cookieValue: string } {
  const env = getClioOAuthEnv();
  const payload: ClioOAuthStatePayload = {
    firmId: params.firmId,
    userId: params.userId,
    nonce: crypto.randomBytes(18).toString("base64url"),
    createdAt: new Date().toISOString(),
  };

  const authorizeUrl = new URL(CLIO_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", env.redirectUri);
  authorizeUrl.searchParams.set("state", payload.nonce);
  authorizeUrl.searchParams.set("redirect_on_decline", "true");

  return {
    authorizeUrl: authorizeUrl.toString(),
    cookieValue: createSignedStateCookie(payload, env),
  };
}

export async function completeClioOAuthCallback(params: {
  stateParam: string;
  stateCookieValue: string | undefined;
  code: string;
}): Promise<{ firmId: string; integrationId: string; accountName: string | null }> {
  const env = getClioOAuthEnv();
  const statePayload = parseSignedStateCookie(params.stateCookieValue, env);
  if (!statePayload || statePayload.nonce !== params.stateParam) {
    throw new ClioOAuthError("Clio OAuth state is invalid or expired.", 400);
  }

  const tokenResponse = await exchangeCodeForTokens({
    code: params.code,
    env,
  });
  const account = await fetchClioWhoAmI(tokenResponse.accessToken);
  const connectedAt = new Date();

  const integration = await prisma.$transaction(async (tx) => {
    const existing = await tx.firmIntegration.findFirst({
      where: {
        firmId: statePayload.firmId,
        provider: IntegrationProvider.CLIO,
        type: IntegrationType.CASE_API,
      },
      include: {
        credentials: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const integrationRow =
      existing ??
      (await tx.firmIntegration.create({
        data: {
          firmId: statePayload.firmId,
          provider: IntegrationProvider.CLIO,
          type: IntegrationType.CASE_API,
          status: IntegrationStatus.DISCONNECTED,
        },
      }));

    await tx.firmIntegration.update({
      where: { id: integrationRow.id },
      data: { status: IntegrationStatus.CONNECTED },
    });

    const encryptedSecret = encryptSecret(
      JSON.stringify(
        buildStoredClioCredential({
          accessToken: tokenResponse.accessToken,
          refreshToken: tokenResponse.refreshToken,
          tokenType: tokenResponse.tokenType,
          expiresAt: tokenResponse.expiresAt,
          connectedAt,
          connectedByUserId: statePayload.userId,
          accountId: account.accountId,
          accountName: account.accountName,
          accountEmail: account.accountEmail,
        })
      )
    );

    const currentCredential = existing?.credentials?.[0] ?? null;
    if (currentCredential) {
      await tx.integrationCredential.update({
        where: { id: currentCredential.id },
        data: {
          encryptedSecret,
          refreshToken: null,
          expiresAt: tokenResponse.expiresAt,
        },
      });
    } else {
      await tx.integrationCredential.create({
        data: {
          integrationId: integrationRow.id,
          encryptedSecret,
          refreshToken: null,
          expiresAt: tokenResponse.expiresAt,
        },
      });
    }

    const currentFirm = await tx.firm.findUnique({
      where: { id: statePayload.firmId },
      select: { settings: true },
    });
    const currentSettings =
      currentFirm?.settings &&
      typeof currentFirm.settings === "object" &&
      !Array.isArray(currentFirm.settings)
        ? (currentFirm.settings as Record<string, unknown>)
        : {};

    const nextSettings: Record<string, unknown> = {
      ...currentSettings,
      crm: "clio",
      crmIntegrationId: integrationRow.id,
    };
    if (account.accountName) {
      nextSettings.clioConnectedAccountLabel = account.accountName;
    }

    await tx.firm.update({
      where: { id: statePayload.firmId },
      data: {
        settings: asInputJsonObject(nextSettings),
      },
    });

    await tx.integrationSyncLog.create({
      data: {
        firmId: statePayload.firmId,
        integrationId: integrationRow.id,
        eventType: "oauth_connect",
        status: "success",
        message: `Clio connected${account.accountName ? ` (${account.accountName})` : ""}`,
      },
    });

    return integrationRow;
  });

  return {
    firmId: statePayload.firmId,
    integrationId: integration.id,
    accountName: account.accountName,
  };
}

export async function getClioConnectionStatus(
  firmId: string
): Promise<ClioConnectionStatus> {
  const envStatus = getClioEnvStatus();
  const { integration, settings } = await findClioIntegration(firmId);

  if (!integration) {
    return {
      envConfigured: envStatus.configured,
      missingEnvVars: envStatus.missingEnvVars,
      connected: false,
      firmId,
      integrationId: null,
      status: "DISCONNECTED",
      accountName: normalizeString(settings.clioConnectedAccountLabel),
      accountEmail: null,
      connectedByUserId: null,
      updatedAt: null,
      redirectUri: envStatus.redirectUri,
    };
  }

  const credentialRow = integration.credentials[0] ?? null;
  let accountName = normalizeString(settings.clioConnectedAccountLabel);
  let accountEmail: string | null = null;
  let connectedByUserId: string | null = null;

  if (credentialRow?.encryptedSecret) {
    try {
      const stored = parseStoredClioCredential(credentialRow.encryptedSecret);
      accountName = accountName ?? stored.accountName ?? stored.accountEmail ?? null;
      accountEmail = stored.accountEmail ?? null;
      connectedByUserId = stored.connectedByUserId ?? null;
    } catch {
      // leave parsed details empty; status route should still return connection row
    }
  }

  return {
    envConfigured: envStatus.configured,
    missingEnvVars: envStatus.missingEnvVars,
    connected:
      integration.status === IntegrationStatus.CONNECTED &&
      credentialRow?.encryptedSecret != null,
    firmId,
    integrationId: integration.id,
    status: integration.status,
    accountName,
    accountEmail,
    connectedByUserId,
    updatedAt: integration.updatedAt.toISOString(),
    redirectUri: envStatus.redirectUri,
  };
}

export async function disconnectClioIntegration(
  firmId: string
): Promise<{ disconnected: boolean; integrationId: string | null }> {
  const { integration, settings } = await findClioIntegration(firmId);
  if (!integration) {
    return { disconnected: false, integrationId: null };
  }

  await prisma.$transaction(async (tx) => {
    await tx.firmIntegration.update({
      where: { id: integration.id },
      data: { status: IntegrationStatus.DISCONNECTED },
    });

    const nextSettings = { ...settings };
    if (normalizeString(nextSettings.crmIntegrationId) === integration.id) {
      delete nextSettings.crmIntegrationId;
    }

    await tx.firm.update({
      where: { id: firmId },
      data: { settings: asInputJsonObject(nextSettings) },
    });

    await tx.integrationSyncLog.create({
      data: {
        firmId,
        integrationId: integration.id,
        eventType: "oauth_disconnect",
        status: "success",
        message: "Clio disconnected",
      },
    });
  });

  return {
    disconnected: true,
    integrationId: integration.id,
  };
}

export async function revokeClioAccessToken(token: string): Promise<void> {
  const env = getClioOAuthEnv();
  const body = new URLSearchParams({ token });
  const basicAuth = Buffer.from(
    `${env.clientId}:${env.clientSecret}`,
    "utf8"
  ).toString("base64");

  const response = await fetch(CLIO_DEAUTHORIZE_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ClioOAuthError(extractClioError(payload), response.status || 502);
  }
}

export function getClioWebReturnUrl(
  status: "success" | "error",
  message?: string | null
): string | null {
  const webBase = process.env.DOC_WEB_BASE_URL?.trim();
  if (!webBase) return null;
  const url = new URL("/dashboard/settings/clio", webBase);
  url.searchParams.set("status", status);
  if (message) {
    url.searchParams.set("message", message.trim().slice(0, 200));
  }
  return url.toString();
}

export function renderClioCallbackHtml(params: {
  title: string;
  message: string;
  actionHref: string | null;
  actionLabel: string;
}) {
  const safeTitle = params.title.replace(/[<>]/g, "");
  const safeMessage = params.message.replace(/[<>]/g, "");
  const actionMarkup = params.actionHref
    ? `<p style="margin-top:20px;"><a href="${params.actionHref}" style="color:#0b63ce;text-decoration:none;font-weight:600;">${params.actionLabel}</a></p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="font-family:Segoe UI,system-ui,sans-serif;background:#f5f7fa;color:#112;padding:40px;">
    <main style="max-width:520px;margin:0 auto;background:white;border:1px solid #dde4ee;border-radius:18px;padding:28px;box-shadow:0 10px 30px rgba(16,24,40,0.08);">
      <h1 style="margin:0 0 12px;font-size:24px;">${safeTitle}</h1>
      <p style="margin:0;color:#475467;line-height:1.6;">${safeMessage}</p>
      ${actionMarkup}
    </main>
  </body>
</html>`;
}
