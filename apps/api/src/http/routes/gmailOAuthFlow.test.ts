import "dotenv/config";

import assert from "node:assert/strict";
import type { Role } from "@prisma/client";

import { prisma } from "../../db/prisma";
import { pgPool } from "../../db/pg";
import { signToken } from "../../lib/jwt";
import { redis } from "../../services/queue";
import { app } from "../server";
import { startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

function createHexKey() {
  return "0123456789abcdef".repeat(4);
}

async function main() {
  const suffix = Date.now();
  const firmId = `gmail-oauth-firm-${suffix}`;
  const adminUserId = `gmail-oauth-admin-${suffix}`;
  const adminEmail = `gmail-oauth-admin-${suffix}@example.com`;
  const originalEnv = {
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    DOC_WEB_BASE_URL: process.env.DOC_WEB_BASE_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
  };
  const originalFetch = globalThis.fetch;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Gmail OAuth route test firm",
    },
  });
  await prisma.user.create({
    data: {
      id: adminUserId,
      firmId,
      email: adminEmail,
      role: "FIRM_ADMIN" as Role,
    },
  });

  const token = signToken({
    userId: adminUserId,
    firmId,
    role: "FIRM_ADMIN",
    email: adminEmail,
  });

  let server: import("node:http").Server | null = null;

  try {
    const started = await startTestServer(app);
    server = started.server;
    if (!server.listening) {
      await new Promise<void>((resolve) => server!.once("listening", resolve));
    }

    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-google-client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-google-client-secret";
    process.env.GOOGLE_OAUTH_REDIRECT_URI = `${started.baseUrl}/gmail/callback`;
    process.env.DOC_WEB_BASE_URL = "https://onyxintels.com";
    process.env.ENCRYPTION_KEY = createHexKey();
    process.env.JWT_SECRET = "gmail-oauth-test-secret";

    const connectResponse = await fetch(
      `${started.baseUrl}/gmail/connect?login_hint=qa-gmail@example.com`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    assert.equal(connectResponse.status, 200);
    assert.match(connectResponse.headers.get("content-type") ?? "", /application\/json/i);
    const connectJson = (await connectResponse.json()) as {
      ok?: boolean;
      authorizeUrl?: string;
      redirectUri?: string | null;
    };
    assert.equal(connectJson.ok, true);
    assert.equal(connectJson.redirectUri, `${started.baseUrl}/gmail/callback`);
    assert.ok(connectJson.authorizeUrl, "Expected Gmail authorizeUrl");

    const authorizeUrl = new URL(connectJson.authorizeUrl!);
    assert.equal(authorizeUrl.origin, "https://accounts.google.com");
    assert.equal(authorizeUrl.searchParams.get("client_id"), "test-google-client-id");
    assert.equal(authorizeUrl.searchParams.get("redirect_uri"), `${started.baseUrl}/gmail/callback`);
    assert.equal(authorizeUrl.searchParams.get("response_type"), "code");
    assert.equal(authorizeUrl.searchParams.get("login_hint"), "qa-gmail@example.com");
    const state = authorizeUrl.searchParams.get("state");
    assert.ok(state, "Expected OAuth state param");

    const stateCookieHeader = connectResponse.headers.get("set-cookie");
    assert.ok(stateCookieHeader, "Expected OAuth state cookie");
    const cookie = stateCookieHeader!.split(";", 1)[0];

    const fetchCalls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      fetchCalls.push({ url, method: init?.method ?? "GET" });

      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) {
        return new Response(
          JSON.stringify({
            sub: "google-user-123",
            email: "qa-gmail@example.com",
            name: "QA Gmail",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return originalFetch(input as never, init);
    }) as typeof globalThis.fetch;

    const callbackResponse = await fetch(
      `${started.baseUrl}/gmail/callback?code=test-code&state=${encodeURIComponent(state!)}`,
      {
        headers: { Cookie: cookie },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      }
    );

    assert.equal(callbackResponse.status, 303);
    const location = callbackResponse.headers.get("location");
    assert.ok(location, "Expected callback redirect location");
    assert.match(location!, /^https:\/\/onyxintels\.com\/dashboard\/integrations\?/);
    assert.match(location!, /emailStatus=success/);
    assert.equal(
      fetchCalls.filter((call) => call.url.startsWith("https://oauth2.googleapis.com/token")).length,
      1
    );
    assert.equal(
      fetchCalls.filter((call) => call.url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")).length,
      1
    );

    const [integration, mailbox, statusResponse] = await Promise.all([
      prisma.firmIntegration.findFirst({
        where: {
          firmId,
          provider: "GMAIL",
          type: "EMAIL",
        },
        include: {
          credentials: true,
        },
      }),
      prisma.mailboxConnection.findFirst({
        where: {
          firmId,
          provider: "GMAIL",
          emailAddress: "qa-gmail@example.com",
        },
      }),
      fetch(`${started.baseUrl}/gmail/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      }),
    ]);

    assert.ok(integration, "Expected Gmail firm integration");
    assert.equal(integration!.status, "CONNECTED");
    assert.equal(integration!.credentials.length, 1);
    assert.ok(mailbox, "Expected Gmail mailbox row");
    assert.equal(mailbox!.active, true);

    assert.equal(statusResponse.status, 200);
    const statusJson = (await statusResponse.json()) as {
      ok?: boolean;
      connected?: boolean;
      accountEmail?: string | null;
      integrationId?: string | null;
      mailboxId?: string | null;
    };
    assert.equal(statusJson.ok, true);
    assert.equal(statusJson.connected, true);
    assert.equal(statusJson.accountEmail, "qa-gmail@example.com");
    assert.equal(statusJson.integrationId, integration!.id);
    assert.equal(statusJson.mailboxId, mailbox!.id);

    console.log("gmailOAuthFlow.test.ts passed");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GOOGLE_OAUTH_CLIENT_ID = originalEnv.GOOGLE_OAUTH_CLIENT_ID;
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = originalEnv.GOOGLE_OAUTH_CLIENT_SECRET;
    process.env.GOOGLE_OAUTH_REDIRECT_URI = originalEnv.GOOGLE_OAUTH_REDIRECT_URI;
    process.env.DOC_WEB_BASE_URL = originalEnv.DOC_WEB_BASE_URL;
    process.env.ENCRYPTION_KEY = originalEnv.ENCRYPTION_KEY;
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;

    if (server) {
      await stopTestServer(server);
    }

    await prisma.integrationSyncLog.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.mailboxConnection.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.integrationCredential.deleteMany({
      where: {
        integration: {
          firmId,
        },
      },
    }).catch(() => undefined);
    await prisma.firmIntegration.deleteMany({ where: { firmId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: adminUserId } }).catch(() => undefined);
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => undefined);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.race([
      Promise.allSettled([prisma.$disconnect(), pgPool.end(), redis.quit()]),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    process.exit(process.exitCode ?? 0);
  });
