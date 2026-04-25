import crypto from "crypto";
import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationType,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { decryptSecret, encryptSecret } from "./credentialEncryption";

const GOOGLE_AUTHORIZE_URL =
  process.env.GOOGLE_OAUTH_AUTHORIZE_URL?.trim() ||
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL =
  process.env.GOOGLE_OAUTH_TOKEN_URL?.trim() ||
  "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL =
  process.env.GOOGLE_OAUTH_USERINFO_URL?.trim() ||
  "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_SCOPE =
  process.env.GOOGLE_OAUTH_SCOPE?.trim() ||
  "openid email profile https://mail.google.com/";
const GOOGLE_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_PRODUCTION_GMAIL_REDIRECT_URI =
  "https://api.onyxintels.com/api/gmail/callback";

type GmailOAuthEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  missingEnvVars: string[];
};

type GmailOAuthStatePayload = {
  firmId: string;
  userId: string | null;
  nonce: string;
  createdAt: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  sub?: string;
  email?: string;
  name?: string;
};

export type StoredGmailCredential = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresAt?: string | null;
  connectedAt: string;
  connectedByUserId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  accountEmail: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUsername: string;
  folder: string;
};

export type GmailConnectionStatus = {
  envConfigured: boolean;
  missingEnvVars: string[];
  connected: boolean;
  firmId: string;
  integrationId: string | null;
  mailboxId: string | null;
  status: IntegrationStatus | "DISCONNECTED";
  accountName: string | null;
  accountEmail: string | null;
  connectedByUserId: string | null;
  updatedAt: string | null;
  redirectUri: string | null;
};

export class GmailOAuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "GmailOAuthError";
    this.statusCode = statusCode;
  }
}

function getGmailOAuthEnv(): GmailOAuthEnv {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    "";
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
    process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() ||
    (process.env.NODE_ENV === "production"
      ? DEFAULT_PRODUCTION_GMAIL_REDIRECT_URI
      : "") ||
    "";

  const missingEnvVars: string[] = [];
  if (!clientId) missingEnvVars.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!clientSecret) missingEnvVars.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!redirectUri) missingEnvVars.push("GOOGLE_OAUTH_REDIRECT_URI");

  if (missingEnvVars.length > 0) {
    throw new GmailOAuthError("Gmail OAuth env is not fully configured.", 500);
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    missingEnvVars: [],
  };
}

export function getGmailEnvStatus(): {
  configured: boolean;
  missingEnvVars: string[];
  redirectUri: string | null;
} {
  try {
    const env = getGmailOAuthEnv();
    return {
      configured: true,
      missingEnvVars: [],
      redirectUri: env.redirectUri,
    };
  } catch (error) {
    if (error instanceof GmailOAuthError) {
      const redirectUri =
        process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
        process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() ||
        (process.env.NODE_ENV === "production"
          ? DEFAULT_PRODUCTION_GMAIL_REDIRECT_URI
          : "") ||
        null;
      return {
        configured: false,
        missingEnvVars: [
          ...((process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
            process.env.GOOGLE_CLIENT_ID?.trim())
            ? []
            : ["GOOGLE_OAUTH_CLIENT_ID"]),
          ...((process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
            process.env.GOOGLE_CLIENT_SECRET?.trim())
            ? []
            : ["GOOGLE_OAUTH_CLIENT_SECRET"]),
          ...(redirectUri ? [] : ["GOOGLE_OAUTH_REDIRECT_URI"]),
        ],
        redirectUri,
      };
    }

    return {
      configured: false,
      missingEnvVars: [
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "GOOGLE_OAUTH_REDIRECT_URI",
      ],
      redirectUri:
        process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ||
        process.env.GMAIL_OAUTH_REDIRECT_URI?.trim() ||
        null,
    };
  }
}

function getStateSigningSecret(env: GmailOAuthEnv): string {
  return process.env.JWT_SECRET?.trim() || env.clientSecret;
}

function createSignedStateCookie(
  payload: GmailOAuthStatePayload,
  env: GmailOAuthEnv
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
  env: GmailOAuthEnv
): GmailOAuthStatePayload | null {
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
    ) as GmailOAuthStatePayload;
    if (!parsed.firmId || !parsed.nonce || !parsed.createdAt) return null;
    const ageMs = Date.now() - new Date(parsed.createdAt).getTime();
    if (
      !Number.isFinite(ageMs) ||
      ageMs < 0 ||
      ageMs > GOOGLE_STATE_MAX_AGE_MS
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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

function extractGoogleError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Google OAuth request failed.";
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
  return "Google OAuth request failed.";
}

function buildStoredGmailCredential(input: {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: Date | null;
  connectedAt: Date;
  connectedByUserId: string | null;
  accountId: string | null;
  accountName: string | null;
  accountEmail: string;
}): StoredGmailCredential {
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
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    imapUsername: input.accountEmail,
    folder: "INBOX",
  };
}

export function parseStoredGmailCredential(
  encryptedSecret: string
): StoredGmailCredential {
  const parsed = JSON.parse(
    decryptSecret(encryptedSecret)
  ) as Partial<StoredGmailCredential>;
  const accessToken = normalizeString(parsed.accessToken);
  const accountEmail = normalizeString(parsed.accountEmail);

  if (!accessToken || !accountEmail) {
    throw new GmailOAuthError("Stored Gmail credential is incomplete.", 500);
  }

  return {
    accessToken,
    refreshToken: normalizeString(parsed.refreshToken) ?? null,
    tokenType: normalizeString(parsed.tokenType) ?? null,
    expiresAt: normalizeString(parsed.expiresAt) ?? null,
    connectedAt:
      normalizeString(parsed.connectedAt) ?? new Date().toISOString(),
    connectedByUserId: normalizeString(parsed.connectedByUserId) ?? null,
    accountId: normalizeString(parsed.accountId) ?? null,
    accountName: normalizeString(parsed.accountName) ?? null,
    accountEmail,
    imapHost: normalizeString(parsed.imapHost) ?? "imap.gmail.com",
    imapPort:
      typeof parsed.imapPort === "number" && Number.isFinite(parsed.imapPort)
        ? parsed.imapPort
        : 993,
    imapSecure: parsed.imapSecure !== false,
    imapUsername: normalizeString(parsed.imapUsername) ?? accountEmail,
    folder: normalizeString(parsed.folder) ?? "INBOX",
  };
}

async function exchangeCodeForTokens(params: {
  code: string;
  env: GmailOAuthEnv;
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

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as
    | GoogleTokenResponse
    | null;
  if (!response.ok || !payload) {
    throw new GmailOAuthError(extractGoogleError(payload), response.status || 502);
  }

  const accessToken = normalizeString(payload.access_token);
  if (!accessToken) {
    throw new GmailOAuthError(
      "Google token exchange did not return an access token.",
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

async function refreshAccessToken(params: {
  refreshToken: string;
  env: GmailOAuthEnv;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: Date | null;
}> {
  const body = new URLSearchParams({
    client_id: params.env.clientId,
    client_secret: params.env.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => null)) as
    | GoogleTokenResponse
    | null;
  if (!response.ok || !payload) {
    throw new GmailOAuthError(extractGoogleError(payload), response.status || 502);
  }

  const accessToken = normalizeString(payload.access_token);
  if (!accessToken) {
    throw new GmailOAuthError(
      "Google refresh did not return an access token.",
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

async function fetchGoogleUserInfo(accessToken: string): Promise<{
  accountId: string | null;
  accountName: string | null;
  accountEmail: string;
}> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | GoogleUserInfoResponse
    | null;
  if (!response.ok || !payload) {
    throw new GmailOAuthError(extractGoogleError(payload), response.status || 502);
  }

  const accountEmail = normalizeString(payload.email);
  if (!accountEmail) {
    throw new GmailOAuthError(
      "Google user info did not return an email address.",
      502
    );
  }

  return {
    accountId: normalizeString(payload.sub),
    accountName: normalizeString(payload.name),
    accountEmail,
  };
}

async function findGmailIntegration(firmId: string) {
  const integration = await prisma.firmIntegration.findFirst({
    where: {
      firmId,
      provider: IntegrationProvider.GMAIL,
      type: IntegrationType.EMAIL,
    },
    include: {
      credentials: {
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
      mailboxConnections: {
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return integration;
}

export function beginGmailOAuthConnect(params: {
  firmId: string;
  userId: string | null;
  loginHint?: string | null;
}): { authorizeUrl: string; cookieValue: string } {
  const env = getGmailOAuthEnv();
  const payload: GmailOAuthStatePayload = {
    firmId: params.firmId,
    userId: params.userId,
    nonce: crypto.randomBytes(18).toString("base64url"),
    createdAt: new Date().toISOString(),
  };

  const authorizeUrl = new URL(GOOGLE_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", env.redirectUri);
  authorizeUrl.searchParams.set("scope", GOOGLE_SCOPE);
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("include_granted_scopes", "true");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", payload.nonce);
  if (params.loginHint?.trim()) {
    authorizeUrl.searchParams.set("login_hint", params.loginHint.trim());
  }

  return {
    authorizeUrl: authorizeUrl.toString(),
    cookieValue: createSignedStateCookie(payload, env),
  };
}

export async function completeGmailOAuthCallback(params: {
  stateParam: string;
  stateCookieValue: string | undefined;
  code: string;
}): Promise<{
  firmId: string;
  integrationId: string;
  mailboxId: string;
  accountName: string | null;
  accountEmail: string;
}> {
  const env = getGmailOAuthEnv();
  const statePayload = parseSignedStateCookie(params.stateCookieValue, env);
  if (!statePayload || statePayload.nonce !== params.stateParam) {
    throw new GmailOAuthError("Gmail OAuth state is invalid or expired.", 400);
  }

  const tokenResponse = await exchangeCodeForTokens({
    code: params.code,
    env,
  });
  const account = await fetchGoogleUserInfo(tokenResponse.accessToken);
  const connectedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.firmIntegration.findFirst({
      where: {
        firmId: statePayload.firmId,
        provider: IntegrationProvider.GMAIL,
        type: IntegrationType.EMAIL,
      },
      include: {
        credentials: {
          take: 1,
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const integrationRow =
      existing ??
      (await tx.firmIntegration.create({
        data: {
          firmId: statePayload.firmId,
          provider: IntegrationProvider.GMAIL,
          type: IntegrationType.EMAIL,
          status: IntegrationStatus.DISCONNECTED,
        },
      }));

    await tx.firmIntegration.update({
      where: { id: integrationRow.id },
      data: { status: IntegrationStatus.CONNECTED },
    });

    const encryptedSecret = encryptSecret(
      JSON.stringify(
        buildStoredGmailCredential({
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

    const existingMailbox = await tx.mailboxConnection.findFirst({
      where: {
        firmId: statePayload.firmId,
        provider: "GMAIL",
        emailAddress: account.accountEmail,
      },
      orderBy: { updatedAt: "desc" },
    });

    const mailbox =
      existingMailbox ??
      (await tx.mailboxConnection.create({
        data: {
          firmId: statePayload.firmId,
          emailAddress: account.accountEmail,
          provider: "GMAIL",
          active: true,
          integrationId: integrationRow.id,
        },
      }));

    if (existingMailbox) {
      await tx.mailboxConnection.update({
        where: { id: existingMailbox.id },
        data: {
          emailAddress: account.accountEmail,
          active: true,
          integrationId: integrationRow.id,
        },
      });
    }

    await tx.firmIntegration.updateMany({
      where: {
        firmId: statePayload.firmId,
        provider: IntegrationProvider.GMAIL,
        type: IntegrationType.EMAIL,
        id: { not: integrationRow.id },
      },
      data: { status: IntegrationStatus.DISCONNECTED },
    });

    await tx.mailboxConnection.updateMany({
      where: {
        firmId: statePayload.firmId,
        provider: "GMAIL",
        id: { not: mailbox.id },
      },
      data: { active: false },
    });

    await tx.integrationSyncLog.create({
      data: {
        firmId: statePayload.firmId,
        integrationId: integrationRow.id,
        eventType: "oauth_connect",
        status: "success",
        message: `Gmail connected (${account.accountEmail})`,
      },
    });

    return {
      integrationId: integrationRow.id,
      mailboxId: existingMailbox?.id ?? mailbox.id,
    };
  });

  return {
    firmId: statePayload.firmId,
    integrationId: result.integrationId,
    mailboxId: result.mailboxId,
    accountName: account.accountName,
    accountEmail: account.accountEmail,
  };
}

export async function ensureFreshGmailCredential(params: {
  credentialId: string;
  encryptedSecret: string;
}): Promise<StoredGmailCredential> {
  const env = getGmailOAuthEnv();
  const stored = parseStoredGmailCredential(params.encryptedSecret);
  const refreshToken = stored.refreshToken?.trim();
  if (!refreshToken) {
    return stored;
  }

  const expiresAtMs = stored.expiresAt
    ? new Date(stored.expiresAt).getTime()
    : NaN;
  const refreshThresholdMs = Date.now() + 60 * 1000;
  const shouldRefresh =
    !stored.accessToken ||
    (Number.isFinite(expiresAtMs) && expiresAtMs <= refreshThresholdMs);

  if (!shouldRefresh) {
    return stored;
  }

  const refreshed = await refreshAccessToken({
    refreshToken,
    env,
  });
  const nextCredential: StoredGmailCredential = {
    ...stored,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? stored.refreshToken ?? null,
    tokenType: refreshed.tokenType ?? stored.tokenType ?? null,
    expiresAt: refreshed.expiresAt?.toISOString() ?? stored.expiresAt ?? null,
  };

  await prisma.integrationCredential.update({
    where: { id: params.credentialId },
    data: {
      encryptedSecret: encryptSecret(JSON.stringify(nextCredential)),
      refreshToken: null,
      expiresAt: refreshed.expiresAt ?? null,
    },
  });

  return nextCredential;
}

export async function getGmailConnectionStatus(
  firmId: string
): Promise<GmailConnectionStatus> {
  const envStatus = getGmailEnvStatus();
  const integration = await findGmailIntegration(firmId);

  if (!integration) {
    return {
      envConfigured: envStatus.configured,
      missingEnvVars: envStatus.missingEnvVars,
      connected: false,
      firmId,
      integrationId: null,
      mailboxId: null,
      status: "DISCONNECTED",
      accountName: null,
      accountEmail: null,
      connectedByUserId: null,
      updatedAt: null,
      redirectUri: envStatus.redirectUri,
    };
  }

  const credentialRow = integration.credentials[0] ?? null;
  let accountName: string | null = null;
  let accountEmail: string | null = null;
  let connectedByUserId: string | null = null;

  if (credentialRow?.encryptedSecret) {
    try {
      const stored = parseStoredGmailCredential(credentialRow.encryptedSecret);
      accountName = stored.accountName ?? null;
      accountEmail = stored.accountEmail;
      connectedByUserId = stored.connectedByUserId ?? null;
    } catch {
      // keep status response usable even if stored secret is malformed
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
    mailboxId: integration.mailboxConnections[0]?.id ?? null,
    status: integration.status,
    accountName,
    accountEmail,
    connectedByUserId,
    updatedAt: integration.updatedAt.toISOString(),
    redirectUri: envStatus.redirectUri,
  };
}

export function getGmailWebReturnUrl(
  status: "success" | "error",
  message?: string | null
): string | null {
  const webBase = process.env.DOC_WEB_BASE_URL?.trim();
  if (!webBase) return null;
  const url = new URL("/dashboard/integrations", webBase);
  url.searchParams.set("focus", "email");
  url.searchParams.set("emailStatus", status);
  if (message) {
    url.searchParams.set("message", message.trim().slice(0, 200));
  }
  return url.toString();
}

export function renderGmailCallbackHtml(params: {
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
