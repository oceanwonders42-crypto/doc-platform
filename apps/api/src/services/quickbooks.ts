import crypto from "crypto";

import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationType,
  Prisma,
  type FirmIntegration,
  type IntegrationCredential,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { logError, logInfo, logWarn } from "../lib/logger";
import { decryptSecret, encryptSecret } from "./credentialEncryption";

const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";
const QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QUICKBOOKS_MINOR_VERSION = "75";
const QUICKBOOKS_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const QUICKBOOKS_EXPIRY_SKEW_MS = 5 * 60 * 1000;

type QuickbooksConnectionRow = FirmIntegration & { credentials: IntegrationCredential[] };

export type QuickbooksEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: "sandbox" | "production";
  apiBaseUrl: string;
  defaultNeutralItemName: string;
  sourceLabel: string;
  expectedRealmId: string | null;
};

type QuickbooksStoredCredential = {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt?: string | null;
  connectedAt: string;
  connectedByUserId?: string | null;
};

type QuickbooksOAuthStatePayload = {
  firmId: string;
  userId: string | null;
  nonce: string;
  createdAt: string;
};

export type QuickbooksConnectionStatus = {
  envConfigured: boolean;
  missingEnvVars: string[];
  connected: boolean;
  integrationId: string | null;
  status: string | null;
  realmId: string | null;
  connectedAt: string | null;
  updatedAt: string | null;
  connectedByUserId: string | null;
};

export type QuickbooksCustomerRecord = {
  Id: string;
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address?: string | null } | null;
};

export type QuickbooksItemRecord = {
  Id: string;
  Name?: string;
  Type?: string;
};

export type QuickbooksInvoiceRecord = {
  Id: string;
  DocNumber?: string | null;
};

export type NeutralQuickbooksCustomerInput = {
  firstName: string | null;
  lastName: string | null;
  billingEmail: string;
};

export type NeutralQuickbooksInvoiceInput = {
  customerId: string;
  billingEmail: string;
  totalAmount: number;
  currency: string;
  neutralLineDescription: string;
  itemId: string;
  txnDate?: string | null;
};

export class QuickbooksConfigError extends Error {
  missingEnvVars: string[];

  constructor(message: string, missingEnvVars: string[] = []) {
    super(message);
    this.name = "QuickbooksConfigError";
    this.missingEnvVars = missingEnvVars;
  }
}

export class QuickbooksAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "QuickbooksAuthError";
    this.statusCode = statusCode;
  }
}

export class QuickbooksApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "QuickbooksApiError";
    this.statusCode = statusCode;
  }
}

function redactSecrets(input: string): string {
  return input
    .replace(/(access[_-]?token["'=:\s]+)([^"\s,&]+)/gi, "$1[redacted]")
    .replace(/(refresh[_-]?token["'=:\s]+)([^"\s,&]+)/gi, "$1[redacted]")
    .replace(/(client[_-]?secret["'=:\s]+)([^"\s,&]+)/gi, "$1[redacted]")
    .replace(/(authorization["'=:\s]+)(basic|bearer)\s+[^"\s,&]+/gi, "$1$2 [redacted]");
}

function sanitizeMetaValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactSecrets(value).slice(0, 500);
  if (Array.isArray(value)) return value.map((item) => sanitizeMetaValue(item));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|authorization|cookie/i.test(key)) continue;
      output[key] = sanitizeMetaValue(nestedValue);
    }
    return output;
  }
  return value;
}

function normalizeQuickbooksMessage(message: string): string {
  return redactSecrets(message).slice(0, 10_000);
}

function parseQuickbooksJsonResponse(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new QuickbooksApiError("QuickBooks returned a non-JSON response.", 502);
  }
}

async function recordQuickbooksEvent(params: {
  firmId: string;
  integrationId?: string | null;
  eventType: string;
  status: "success" | "error" | "info";
  message: string;
  meta?: Record<string, unknown> | null;
}) {
  const safeMessage = normalizeQuickbooksMessage(params.message);
  const safeMeta = (sanitizeMetaValue(params.meta ?? null) as Record<string, unknown> | null) ?? null;

  if (params.status === "error") {
    logError("quickbooks_event", {
      firmId: params.firmId,
      integrationId: params.integrationId ?? null,
      eventType: params.eventType,
      status: params.status,
      message: safeMessage,
      ...safeMeta,
    });
  } else if (params.status === "success") {
    logInfo("quickbooks_event", {
      firmId: params.firmId,
      integrationId: params.integrationId ?? null,
      eventType: params.eventType,
      status: params.status,
      ...safeMeta,
    });
  } else {
    logWarn("quickbooks_event", {
      firmId: params.firmId,
      integrationId: params.integrationId ?? null,
      eventType: params.eventType,
      status: params.status,
      ...safeMeta,
    });
  }

  if (params.integrationId) {
    await prisma.integrationSyncLog.create({
      data: {
        firmId: params.firmId,
        integrationId: params.integrationId,
        eventType: params.eventType,
        status: params.status,
        message: safeMessage,
      },
    });
  }

  if (params.status === "error") {
    await prisma.systemErrorLog.create({
      data: {
        service: "api",
        firmId: params.firmId,
        area: "quickbooks",
        status: "open",
        severity: "error",
        message: safeMessage,
        metaJson: (safeMeta as Prisma.InputJsonValue | null) ?? undefined,
      },
    });
  }
}

function identifyQuickbooksCustomerLookupStrategy(query: string): "email" | "display_name" | "other" {
  if (query.includes("PrimaryEmailAddr")) return "email";
  if (query.includes("DisplayName")) return "display_name";
  return "other";
}

export function getQuickbooksEnv(): QuickbooksEnv {
  const missingEnvVars: string[] = [];
  const clientId = process.env.QBO_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.QBO_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.QBO_REDIRECT_URI?.trim() ?? "";
  const rawEnvironment = (process.env.QBO_ENV?.trim().toLowerCase() || "production") as "sandbox" | "production";
  const expectedRealmId = process.env.QBO_REALM_ID?.trim() || null;
  const defaultNeutralItemName = process.env.QBO_DEFAULT_NEUTRAL_ITEM_NAME?.trim() || "OnyxIntel invoice";
  const sourceLabel = process.env.QBO_SOURCE_LABEL?.trim() || "OnyxIntel";

  if (!clientId) missingEnvVars.push("QBO_CLIENT_ID");
  if (!clientSecret) missingEnvVars.push("QBO_CLIENT_SECRET");
  if (!redirectUri) missingEnvVars.push("QBO_REDIRECT_URI");
  if (!process.env.QBO_ENV?.trim()) missingEnvVars.push("QBO_ENV");

  if (missingEnvVars.length > 0) {
    throw new QuickbooksConfigError("QuickBooks env is not fully configured.", missingEnvVars);
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    environment: rawEnvironment === "sandbox" ? "sandbox" : "production",
    apiBaseUrl:
      rawEnvironment === "sandbox"
        ? "https://sandbox-quickbooks.api.intuit.com"
        : "https://quickbooks.api.intuit.com",
    defaultNeutralItemName,
    sourceLabel,
    expectedRealmId,
  };
}

export function getQuickbooksEnvStatus(): { configured: boolean; missingEnvVars: string[] } {
  try {
    getQuickbooksEnv();
    return { configured: true, missingEnvVars: [] };
  } catch (error) {
    if (error instanceof QuickbooksConfigError) {
      return { configured: false, missingEnvVars: error.missingEnvVars };
    }
    return { configured: false, missingEnvVars: ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "QBO_REDIRECT_URI", "QBO_ENV"] };
  }
}

function getStateSigningSecret(env: QuickbooksEnv): string {
  return process.env.JWT_SECRET?.trim() || env.clientSecret;
}

function createSignedStateCookie(payload: QuickbooksOAuthStatePayload, env: QuickbooksEnv): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getStateSigningSecret(env))
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function parseSignedStateCookie(value: string | undefined, env: QuickbooksEnv): QuickbooksOAuthStatePayload | null {
  if (!value || !value.includes(".")) return null;
  const [encodedPayload, signature] = value.split(".", 2);
  if (!encodedPayload || !signature) return null;
  const expectedSignature = crypto
    .createHmac("sha256", getStateSigningSecret(env))
    .update(encodedPayload)
    .digest("base64url");
  if (signature !== expectedSignature) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as QuickbooksOAuthStatePayload;
    if (!parsed.firmId || !parsed.nonce || !parsed.createdAt) return null;
    const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > QUICKBOOKS_STATE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function beginQuickbooksOAuthConnect(params: {
  firmId: string;
  userId: string | null;
}): { authorizeUrl: string; cookieValue: string } {
  const env = getQuickbooksEnv();
  const payload: QuickbooksOAuthStatePayload = {
    firmId: params.firmId,
    userId: params.userId,
    nonce: crypto.randomBytes(18).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  const authorizeUrl = new URL(QUICKBOOKS_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", QUICKBOOKS_SCOPE);
  authorizeUrl.searchParams.set("redirect_uri", env.redirectUri);
  authorizeUrl.searchParams.set("state", payload.nonce);
  return {
    authorizeUrl: authorizeUrl.toString(),
    cookieValue: createSignedStateCookie(payload, env),
  };
}

async function findQuickbooksIntegrationForFirm(firmId: string): Promise<QuickbooksConnectionRow | null> {
  return prisma.firmIntegration.findFirst({
    where: {
      firmId,
      provider: IntegrationProvider.QUICKBOOKS,
    },
    include: {
      credentials: {
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

function parseStoredCredential(encryptedSecret: string): QuickbooksStoredCredential {
  const parsed = JSON.parse(decryptSecret(encryptedSecret)) as Partial<QuickbooksStoredCredential>;
  if (
    !parsed.realmId ||
    !parsed.accessToken ||
    !parsed.refreshToken ||
    !parsed.accessTokenExpiresAt ||
    !parsed.connectedAt
  ) {
    throw new QuickbooksAuthError("QuickBooks credential is incomplete.", 500);
  }
  return {
    realmId: parsed.realmId,
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    accessTokenExpiresAt: parsed.accessTokenExpiresAt,
    refreshTokenExpiresAt: parsed.refreshTokenExpiresAt ?? null,
    connectedAt: parsed.connectedAt,
    connectedByUserId: parsed.connectedByUserId ?? null,
  };
}

function buildStoredCredential(input: {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
  connectedAt: Date;
  connectedByUserId: string | null;
}): QuickbooksStoredCredential {
  return {
    realmId: input.realmId,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    accessTokenExpiresAt: input.accessTokenExpiresAt.toISOString(),
    refreshTokenExpiresAt: input.refreshTokenExpiresAt?.toISOString() ?? null,
    connectedAt: input.connectedAt.toISOString(),
    connectedByUserId: input.connectedByUserId,
  };
}

function extractQuickbooksError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "QuickBooks request failed.";
  }

  const record = payload as Record<string, unknown>;
  const fault = record.Fault as Record<string, unknown> | undefined;
  const faultErrors = Array.isArray(fault?.Error) ? (fault!.Error as Array<Record<string, unknown>>) : [];
  const firstFault = faultErrors[0];
  const errorMessage =
    typeof firstFault?.Message === "string"
      ? firstFault.Message
      : typeof firstFault?.Detail === "string"
        ? firstFault.Detail
        : typeof record.error_description === "string"
          ? record.error_description
          : typeof record.error === "string"
            ? record.error
            : "QuickBooks request failed.";
  return normalizeQuickbooksMessage(errorMessage);
}

async function exchangeCodeForTokens(params: {
  code: string;
  env: QuickbooksEnv;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
}> {
  const basicAuth = Buffer.from(`${params.env.clientId}:${params.env.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.env.redirectUri,
  });
  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    throw new QuickbooksAuthError(extractQuickbooksError(payload), response.status || 502);
  }
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
  const expiresIn = Number.parseInt(String(payload.expires_in ?? ""), 10);
  const refreshExpiresIn = Number.parseInt(String(payload.x_refresh_token_expires_in ?? ""), 10);

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn)) {
    throw new QuickbooksAuthError("QuickBooks token exchange did not return the required tokens.", 502);
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    refreshTokenExpiresAt: Number.isFinite(refreshExpiresIn)
      ? new Date(Date.now() + refreshExpiresIn * 1000)
      : null,
  };
}

export async function completeQuickbooksOAuthCallback(params: {
  stateParam: string;
  stateCookieValue: string | undefined;
  code: string;
  realmId: string;
}): Promise<{ firmId: string; integrationId: string }> {
  const env = getQuickbooksEnv();
  const statePayload = parseSignedStateCookie(params.stateCookieValue, env);
  if (!statePayload || statePayload.nonce !== params.stateParam) {
    throw new QuickbooksAuthError("QuickBooks OAuth state is invalid or expired.", 400);
  }
  if (env.expectedRealmId && params.realmId !== env.expectedRealmId) {
    throw new QuickbooksAuthError("QuickBooks callback realmId does not match configured realm.", 400);
  }
  const tokenResponse = await exchangeCodeForTokens({ code: params.code, env });
  const connectedAt = new Date();
  const integration = await prisma.$transaction(async (tx) => {
    const existing = await tx.firmIntegration.findFirst({
      where: {
        firmId: statePayload.firmId,
        provider: IntegrationProvider.QUICKBOOKS,
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
          type: IntegrationType.CASE_API,
          provider: IntegrationProvider.QUICKBOOKS,
          status: IntegrationStatus.DISCONNECTED,
        },
      }));

    await tx.firmIntegration.update({
      where: { id: integrationRow.id },
      data: { status: IntegrationStatus.CONNECTED },
    });

    const encryptedSecret = encryptSecret(
      JSON.stringify(
        buildStoredCredential({
          realmId: params.realmId,
          accessToken: tokenResponse.accessToken,
          refreshToken: tokenResponse.refreshToken,
          accessTokenExpiresAt: tokenResponse.accessTokenExpiresAt,
          refreshTokenExpiresAt: tokenResponse.refreshTokenExpiresAt,
          connectedAt,
          connectedByUserId: statePayload.userId,
        })
      )
    );

    const currentCredential = existing?.credentials?.[0] ?? null;
    if (currentCredential) {
      await tx.integrationCredential.update({
        where: { id: currentCredential.id },
        data: {
          encryptedSecret,
          expiresAt: tokenResponse.accessTokenExpiresAt,
          refreshToken: null,
        },
      });
    } else {
      await tx.integrationCredential.create({
        data: {
          integrationId: integrationRow.id,
          encryptedSecret,
          expiresAt: tokenResponse.accessTokenExpiresAt,
        },
      });
    }

    return integrationRow;
  });

  await recordQuickbooksEvent({
    firmId: statePayload.firmId,
    integrationId: integration.id,
    eventType: "oauth_callback",
    status: "success",
    message: "QuickBooks connection updated.",
    meta: {
      realmId: params.realmId,
      connectedByUserId: statePayload.userId,
    },
  });

  return { firmId: statePayload.firmId, integrationId: integration.id };
}

export async function getQuickbooksConnectionStatus(firmId: string): Promise<QuickbooksConnectionStatus> {
  const envStatus = getQuickbooksEnvStatus();
  const integration = await findQuickbooksIntegrationForFirm(firmId);
  const credential = integration?.credentials?.[0] ? parseStoredCredential(integration.credentials[0].encryptedSecret) : null;
  return {
    envConfigured: envStatus.configured,
    missingEnvVars: envStatus.missingEnvVars,
    connected: Boolean(integration && integration.status === IntegrationStatus.CONNECTED && credential),
    integrationId: integration?.id ?? null,
    status: integration?.status ?? null,
    realmId: credential?.realmId ?? null,
    connectedAt: credential?.connectedAt ?? null,
    updatedAt: integration?.updatedAt.toISOString() ?? null,
    connectedByUserId: credential?.connectedByUserId ?? null,
  };
}

type ResolvedQuickbooksConnection = {
  firmId: string;
  integrationId: string;
  realmId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
  connectedAt: Date;
  connectedByUserId: string | null;
};

async function updateStoredQuickbooksCredential(params: {
  firmId: string;
  integrationId: string;
  credentialId: string;
  nextCredential: ResolvedQuickbooksConnection;
}) {
  const encryptedSecret = encryptSecret(
    JSON.stringify(
      buildStoredCredential({
        realmId: params.nextCredential.realmId,
        accessToken: params.nextCredential.accessToken,
        refreshToken: params.nextCredential.refreshToken,
        accessTokenExpiresAt: params.nextCredential.accessTokenExpiresAt,
        refreshTokenExpiresAt: params.nextCredential.refreshTokenExpiresAt,
        connectedAt: params.nextCredential.connectedAt,
        connectedByUserId: params.nextCredential.connectedByUserId,
      })
    )
  );

  await prisma.integrationCredential.update({
    where: { id: params.credentialId },
    data: {
      encryptedSecret,
      expiresAt: params.nextCredential.accessTokenExpiresAt,
      refreshToken: null,
    },
  });
  await prisma.firmIntegration.update({
    where: { id: params.integrationId },
    data: { status: IntegrationStatus.CONNECTED },
  });
}

export async function ensureFreshQuickbooksConnection(params: {
  firmId: string;
  forceRefresh?: boolean;
  requestId?: string | null;
}): Promise<ResolvedQuickbooksConnection> {
  const env = getQuickbooksEnv();
  const integration = await findQuickbooksIntegrationForFirm(params.firmId);
  if (!integration || integration.status === IntegrationStatus.DISCONNECTED) {
    throw new QuickbooksAuthError("QuickBooks is not connected for this firm.", 409);
  }
  const credentialRow = integration.credentials[0];
  if (!credentialRow) {
    throw new QuickbooksAuthError("QuickBooks credential is missing.", 409);
  }
  const parsed = parseStoredCredential(credentialRow.encryptedSecret);
  const connection: ResolvedQuickbooksConnection = {
    firmId: params.firmId,
    integrationId: integration.id,
    realmId: parsed.realmId,
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    accessTokenExpiresAt: new Date(parsed.accessTokenExpiresAt),
    refreshTokenExpiresAt: parsed.refreshTokenExpiresAt ? new Date(parsed.refreshTokenExpiresAt) : null,
    connectedAt: new Date(parsed.connectedAt),
    connectedByUserId: parsed.connectedByUserId ?? null,
  };

  const shouldRefresh =
    params.forceRefresh === true ||
    connection.accessTokenExpiresAt.getTime() - Date.now() <= QUICKBOOKS_EXPIRY_SKEW_MS;

  if (!shouldRefresh) {
    return connection;
  }

  const basicAuth = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    }).toString(),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    await prisma.firmIntegration.update({
      where: { id: integration.id },
      data: { status: IntegrationStatus.ERROR },
    });
    const message = extractQuickbooksError(payload);
    await recordQuickbooksEvent({
      firmId: params.firmId,
      integrationId: integration.id,
      eventType: "token_refresh",
      status: "error",
      message,
      meta: {
        statusCode: response.status,
        requestId: params.requestId ?? null,
      },
    });
    throw new QuickbooksAuthError(message, response.status || 502);
  }

  const refreshedConnection: ResolvedQuickbooksConnection = {
    ...connection,
    accessToken: typeof payload.access_token === "string" ? payload.access_token : "",
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : connection.refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + Number.parseInt(String(payload.expires_in ?? "3600"), 10) * 1000),
    refreshTokenExpiresAt: payload.x_refresh_token_expires_in
      ? new Date(Date.now() + Number.parseInt(String(payload.x_refresh_token_expires_in), 10) * 1000)
      : connection.refreshTokenExpiresAt,
  };

  if (!refreshedConnection.accessToken) {
    throw new QuickbooksAuthError("QuickBooks token refresh did not return an access token.", 502);
  }

  await updateStoredQuickbooksCredential({
    firmId: params.firmId,
    integrationId: integration.id,
    credentialId: credentialRow.id,
    nextCredential: refreshedConnection,
  });
  await recordQuickbooksEvent({
    firmId: params.firmId,
    integrationId: integration.id,
    eventType: "token_refresh",
    status: "success",
    message: "QuickBooks access token refreshed.",
    meta: {
      requestId: params.requestId ?? null,
    },
  });
  return refreshedConnection;
}

function buildQuickbooksApiUrl(params: {
  env: QuickbooksEnv;
  realmId: string;
  path: string;
  requestId?: string | null;
  query?: Record<string, string | null | undefined>;
}): string {
  const url = new URL(`${params.env.apiBaseUrl}/v3/company/${params.realmId}${params.path}`);
  url.searchParams.set("minorversion", QUICKBOOKS_MINOR_VERSION);
  if (params.requestId) {
    url.searchParams.set("requestid", params.requestId.slice(0, 50));
  }
  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function quickbooksRequest(params: {
  firmId: string;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  requestId?: string | null;
  query?: Record<string, string | null | undefined>;
  requestLabel: string;
  retryOnUnauthorized?: boolean;
}) {
  const env = getQuickbooksEnv();
  let connection = await ensureFreshQuickbooksConnection({ firmId: params.firmId });
  const makeRequest = async (forceRefresh = false) => {
    if (forceRefresh) {
      connection = await ensureFreshQuickbooksConnection({ firmId: params.firmId, forceRefresh: true });
    }
    const response = await fetch(
      buildQuickbooksApiUrl({
        env,
        realmId: connection.realmId,
        path: params.path,
        requestId: params.requestId,
        query: params.query,
      }),
      {
        method: params.method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${connection.accessToken}`,
          ...(params.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
      }
    );
    const text = await response.text();
    const payload = parseQuickbooksJsonResponse(text);
    if (response.status === 401 && params.retryOnUnauthorized !== false && !forceRefresh) {
      return makeRequest(true);
    }
    if (!response.ok) {
      throw new QuickbooksApiError(extractQuickbooksError(payload), response.status || 502);
    }
    return payload;
  };

  try {
    return await makeRequest(false);
  } catch (error) {
    await recordQuickbooksEvent({
      firmId: params.firmId,
      integrationId: connection.integrationId,
      eventType: params.requestLabel,
      status: "error",
      message: error instanceof Error ? error.message : "QuickBooks request failed.",
      meta: {
        path: params.path,
        method: params.method,
      },
    });
    throw error;
  }
}

function escapeQuickbooksQueryValue(value: string): string {
  return value.replace(/'/g, "''");
}

async function quickbooksQueryEntity<T>(params: {
  firmId: string;
  entityName: string;
  query: string;
  requestId?: string | null;
}) {
  const payload = (await quickbooksRequest({
    firmId: params.firmId,
    method: "GET",
    path: "/query",
    query: {
      query: params.query,
    },
    requestLabel: `${params.entityName.toLowerCase()}_query`,
    requestId: params.requestId,
  })) as Record<string, unknown> | null;

  const queryResponse = payload?.QueryResponse as Record<string, unknown> | undefined;
  const items = queryResponse?.[params.entityName];
  return Array.isArray(items) ? (items as T[]) : [];
}

function normalizeBillingEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildNeutralDisplayName(params: {
  firstName: string | null;
  lastName: string | null;
  billingEmail: string;
}): string {
  const parts = [params.firstName?.trim() ?? "", params.lastName?.trim() ?? ""].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return normalizeBillingEmail(params.billingEmail).split("@")[0] || "OnyxIntel";
}

export async function findQuickbooksCustomerByEmailOrName(params: {
  firmId: string;
  billingEmail: string;
  firstName: string | null;
  lastName: string | null;
  requestId?: string | null;
}): Promise<QuickbooksCustomerRecord | null> {
  const billingEmail = normalizeBillingEmail(params.billingEmail);
  const displayName = buildNeutralDisplayName(params);

  const candidateQueries: string[] = [];
  if (billingEmail) {
    const safeEmail = escapeQuickbooksQueryValue(billingEmail);
    candidateQueries.push(`select * from Customer where PrimaryEmailAddr = '${safeEmail}' maxresults 10`);
    candidateQueries.push(`select * from Customer where PrimaryEmailAddr.Address = '${safeEmail}' maxresults 10`);
  }
  candidateQueries.push(`select * from Customer where DisplayName = '${escapeQuickbooksQueryValue(displayName)}' maxresults 10`);

  for (const query of candidateQueries) {
    try {
      const customers = await quickbooksQueryEntity<QuickbooksCustomerRecord>({
        firmId: params.firmId,
        entityName: "Customer",
        query,
        requestId: params.requestId,
      });
      const exactEmailMatch = customers.find((customer) => {
        const candidateEmail = customer.PrimaryEmailAddr?.Address?.trim().toLowerCase() ?? "";
        return candidateEmail !== "" && candidateEmail === billingEmail;
      });
      if (exactEmailMatch) return exactEmailMatch;
      const exactNameMatch = customers.find(
        (customer) => (customer.DisplayName?.trim() ?? "") === displayName
      );
      if (exactNameMatch) return exactNameMatch;
    } catch (error) {
      // Some query variants are not supported consistently. Keep the safest fallback path.
      logWarn("quickbooks_customer_lookup_query_failed", {
        firmId: params.firmId,
        strategy: identifyQuickbooksCustomerLookupStrategy(query),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

export async function createQuickbooksCustomer(params: {
  firmId: string;
  billingEmail: string;
  firstName: string | null;
  lastName: string | null;
  requestId?: string | null;
}): Promise<QuickbooksCustomerRecord> {
  const displayName = buildNeutralDisplayName(params);
  const payload = {
    DisplayName: displayName,
    GivenName: params.firstName?.trim() || undefined,
    FamilyName: params.lastName?.trim() || undefined,
    PrimaryEmailAddr: { Address: normalizeBillingEmail(params.billingEmail) },
  };

  const response = (await quickbooksRequest({
    firmId: params.firmId,
    method: "POST",
    path: "/customer",
    body: payload,
    requestId: params.requestId,
    requestLabel: "customer_create",
  })) as Record<string, unknown>;

  const customer = response.Customer as QuickbooksCustomerRecord | undefined;
  if (!customer?.Id) {
    throw new QuickbooksApiError("QuickBooks customer creation did not return a customer id.", 502);
  }
  await recordQuickbooksEvent({
    firmId: params.firmId,
    eventType: "customer_create",
    status: "success",
    message: "QuickBooks customer created.",
    meta: {
      customerId: customer.Id,
    },
  });
  return customer;
}

async function getQuickbooksNeutralIncomeAccountId(firmId: string, requestId?: string | null): Promise<string> {
  const accounts = await quickbooksQueryEntity<Array<{ Id: string }>[number]>({
    firmId,
    entityName: "Account",
    query: "select * from Account where AccountType = 'Income' and Active = true maxresults 1",
    requestId,
  });
  const firstAccount = accounts[0];
  if (!firstAccount?.Id) {
    throw new QuickbooksApiError("QuickBooks does not have an active income account for the neutral invoice item.", 409);
  }
  return firstAccount.Id;
}

export async function findOrCreateNeutralQuickbooksItem(params: {
  firmId: string;
  requestId?: string | null;
}): Promise<QuickbooksItemRecord> {
  const env = getQuickbooksEnv();
  const safeName = escapeQuickbooksQueryValue(env.defaultNeutralItemName);
  const existingItems = await quickbooksQueryEntity<QuickbooksItemRecord>({
    firmId: params.firmId,
    entityName: "Item",
    query: `select * from Item where Name = '${safeName}' maxresults 1`,
    requestId: params.requestId,
  });
  if (existingItems[0]?.Id) {
    return existingItems[0];
  }

  const incomeAccountId = await getQuickbooksNeutralIncomeAccountId(params.firmId, params.requestId);
  const payload = {
    Name: env.defaultNeutralItemName,
    Type: "Service",
    Description: env.defaultNeutralItemName,
    IncomeAccountRef: { value: incomeAccountId },
  };
  const response = (await quickbooksRequest({
    firmId: params.firmId,
    method: "POST",
    path: "/item",
    body: payload,
    requestId: params.requestId,
    requestLabel: "item_create",
  })) as Record<string, unknown>;
  const item = response.Item as QuickbooksItemRecord | undefined;
  if (!item?.Id) {
    throw new QuickbooksApiError("QuickBooks neutral item creation did not return an item id.", 502);
  }
  return item;
}

export function buildNeutralQuickbooksInvoicePayload(input: NeutralQuickbooksInvoiceInput) {
  return {
    CustomerRef: { value: input.customerId },
    BillEmail: { Address: normalizeBillingEmail(input.billingEmail) },
    TxnDate: input.txnDate ?? new Date().toISOString().slice(0, 10),
    CurrencyRef: { value: input.currency.toUpperCase() },
    Line: [
      {
        Amount: Number(input.totalAmount.toFixed(2)),
        Description: input.neutralLineDescription,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: {
          ItemRef: { value: input.itemId },
          Qty: 1,
          UnitPrice: Number(input.totalAmount.toFixed(2)),
        },
      },
    ],
  };
}

export async function createQuickbooksInvoice(params: {
  firmId: string;
  customerId: string;
  billingEmail: string;
  totalAmount: number;
  currency: string;
  requestId?: string | null;
}): Promise<QuickbooksInvoiceRecord> {
  const env = getQuickbooksEnv();
  const neutralItem = await findOrCreateNeutralQuickbooksItem({
    firmId: params.firmId,
    requestId: params.requestId,
  });
  const payload = buildNeutralQuickbooksInvoicePayload({
    customerId: params.customerId,
    billingEmail: params.billingEmail,
    totalAmount: params.totalAmount,
    currency: params.currency,
    neutralLineDescription: env.defaultNeutralItemName,
    itemId: neutralItem.Id,
  });
  const response = (await quickbooksRequest({
    firmId: params.firmId,
    method: "POST",
    path: "/invoice",
    body: payload,
    requestId: params.requestId,
    requestLabel: "invoice_create",
  })) as Record<string, unknown>;
  const invoice = response.Invoice as QuickbooksInvoiceRecord | undefined;
  if (!invoice?.Id) {
    throw new QuickbooksApiError("QuickBooks invoice creation did not return an invoice id.", 502);
  }
  await recordQuickbooksEvent({
    firmId: params.firmId,
    eventType: "invoice_create",
    status: "success",
    message: "QuickBooks invoice created.",
    meta: {
      invoiceId: invoice.Id,
      docNumber: invoice.DocNumber ?? null,
    },
  });
  return invoice;
}

export async function sendQuickbooksInvoice(params: {
  firmId: string;
  invoiceId: string;
  billingEmail: string;
  requestId?: string | null;
}) {
  if (!params.billingEmail.trim()) {
    throw new QuickbooksApiError("Billing email is required before sending a QuickBooks invoice.", 409);
  }
  await quickbooksRequest({
    firmId: params.firmId,
    method: "POST",
    path: `/invoice/${params.invoiceId}/send`,
    requestId: params.requestId,
    query: {
      sendTo: normalizeBillingEmail(params.billingEmail),
    },
    requestLabel: "invoice_send",
  });
  await recordQuickbooksEvent({
    firmId: params.firmId,
    eventType: "invoice_send",
    status: "success",
    message: "QuickBooks invoice email triggered.",
    meta: {
      invoiceId: params.invoiceId,
    },
  });
}

export function getQuickbooksWebReturnUrl(status: "success" | "error", message?: string | null): string | null {
  const webBase = process.env.DOC_WEB_BASE_URL?.trim();
  if (!webBase) return null;
  const url = new URL("/dashboard/integrations/quickbooks", webBase);
  url.searchParams.set("status", status);
  if (message) url.searchParams.set("message", normalizeQuickbooksMessage(message).slice(0, 200));
  return url.toString();
}

export function renderQuickbooksCallbackHtml(params: {
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
