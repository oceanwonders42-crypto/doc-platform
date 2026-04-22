import "dotenv/config";

import { IntegrationProvider, IntegrationStatus, Role, QuickbooksInvoiceStatus } from "@prisma/client";

import { prisma } from "../../db/prisma";
import { signToken } from "../../lib/jwt";
import { createFirmApiKey } from "../../services/firmOnboarding";
import {
  beginQuickbooksOAuthConnect,
  ensureFreshQuickbooksConnection,
} from "../../services/quickbooks";
import { decryptSecret, encryptSecret } from "../../services/credentialEncryption";
import { app } from "../server";
import { assert, startTestServer, stopTestServer } from "./cases.batchClioRouteTestUtils";

process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.QBO_CLIENT_ID = "quickbooks-client-id";
process.env.QBO_CLIENT_SECRET = "quickbooks-client-secret";
process.env.QBO_REDIRECT_URI = "https://onyxintels.com/api/qbo/callback";
process.env.QBO_REALM_ID = "realm-123";
process.env.QBO_ENV = "production";
process.env.QBO_DEFAULT_NEUTRAL_ITEM_NAME = "OnyxIntel invoice";
process.env.QBO_SOURCE_LABEL = "OnyxIntel";
process.env.DOC_WEB_BASE_URL = "https://app.onyx.test";

type FetchMockResponse = {
  status?: number;
  body?: Record<string, unknown>;
};

function jsonResponse({ status = 200, body = {} }: FetchMockResponse = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function main() {
  const suffix = Date.now();
  const firmId = `quickbooks-flow-firm-${suffix}`;
  const adminUserId = `quickbooks-admin-${suffix}`;
  const originalFetch = globalThis.fetch.bind(globalThis);
  let baseUrl = "";

  const tokenCalls: string[] = [];
  const invoiceCreateBodies: Array<Record<string, unknown>> = [];
  const invoiceSendCalls: string[] = [];
  const eventOrder: string[] = [];
  let customerCreateCount = 0;
  let invoiceCreateCount = 0;
  let itemCreateCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (baseUrl && url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url === "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer") {
      tokenCalls.push(init?.body ? String(init.body) : "");
      if (String(init?.body ?? "").includes("authorization_code")) {
        return jsonResponse({
          body: {
            access_token: "oauth-access-token",
            refresh_token: "oauth-refresh-token",
            expires_in: 3600,
            x_refresh_token_expires_in: 8640000,
            token_type: "bearer",
          },
        });
      }
      return jsonResponse({
        body: {
          access_token: "refreshed-access-token",
          refresh_token: "refreshed-refresh-token",
          expires_in: 3600,
          x_refresh_token_expires_in: 8640000,
          token_type: "bearer",
        },
      });
    }
    if (url.startsWith("https://quickbooks.api.intuit.com")) {
      const requestUrl = new URL(url);
      if (requestUrl.pathname.endsWith("/query")) {
        const query = requestUrl.searchParams.get("query") ?? "";
        if (query.includes("from Customer")) {
          return jsonResponse({ body: { QueryResponse: {} } });
        }
        if (query.includes("from Item")) {
          return jsonResponse({ body: { QueryResponse: {} } });
        }
        if (query.includes("from Account")) {
          return jsonResponse({
            body: { QueryResponse: { Account: [{ Id: "income-account-1" }] } },
          });
        }
      }

      if (requestUrl.pathname.endsWith("/customer")) {
        customerCreateCount += 1;
        eventOrder.push("customer_create");
        return jsonResponse({
          body: {
            Customer: {
              Id: "qbo-customer-1",
              DisplayName: "Jamie Rivera",
              PrimaryEmailAddr: { Address: "jamie@example.com" },
            },
          },
        });
      }

      if (requestUrl.pathname.endsWith("/item")) {
        itemCreateCount += 1;
        eventOrder.push("item_create");
        return jsonResponse({
          body: {
            Item: {
              Id: "neutral-item-1",
              Name: "OnyxIntel invoice",
            },
          },
        });
      }

      if (requestUrl.pathname.endsWith("/invoice")) {
        invoiceCreateCount += 1;
        eventOrder.push("invoice_create");
        invoiceCreateBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return jsonResponse({
          body: {
            Invoice: {
              Id: "qbo-invoice-1",
              DocNumber: "INV-1001",
            },
          },
        });
      }

      if (requestUrl.pathname.includes("/invoice/") && requestUrl.pathname.endsWith("/send")) {
        eventOrder.push("invoice_send");
        invoiceSendCalls.push(url);
        return jsonResponse({ body: { Invoice: { Id: "qbo-invoice-1" } } });
      }
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "QuickBooks Flow Test Firm",
    },
  });

  const { baseUrl: localBaseUrl, server } = await startTestServer(app);
  baseUrl = localBaseUrl;

  try {
    const { authorizeUrl, cookieValue } = beginQuickbooksOAuthConnect({
      firmId,
      userId: adminUserId,
    });
    const authUrl = new URL(authorizeUrl);
    assert(
      authUrl.searchParams.get("redirect_uri") === process.env.QBO_REDIRECT_URI,
      `Expected authorize URL redirect_uri to match QBO_REDIRECT_URI, got ${authUrl.searchParams.get("redirect_uri")}`
    );
    const stateParam = authUrl.searchParams.get("state") ?? "";

    const callbackResponse = await fetch(
      `${baseUrl}/api/qbo/callback?code=oauth-code-1&state=${encodeURIComponent(
        stateParam
      )}&realmId=realm-123`,
      {
        headers: {
          Cookie: `qbo_oauth_state=${cookieValue}`,
        },
        redirect: "manual",
      }
    );
    assert(callbackResponse.status === 303, `Expected OAuth callback to redirect, got ${callbackResponse.status}`);
    assert(
      callbackResponse.headers.get("location") === "https://app.onyx.test/dashboard/integrations/quickbooks?status=success",
      `Unexpected OAuth callback redirect: ${callbackResponse.headers.get("location")}`
    );

    const quickbooksIntegration = await prisma.firmIntegration.findFirst({
      where: { firmId, provider: IntegrationProvider.QUICKBOOKS },
      include: { credentials: true },
    });
    assert(quickbooksIntegration !== null, "Expected QuickBooks integration row after OAuth callback.");
    assert(
      quickbooksIntegration!.status === IntegrationStatus.CONNECTED,
      `Expected QuickBooks integration status CONNECTED, got ${quickbooksIntegration!.status}`
    );
    const storedCredential = JSON.parse(
      decryptSecret(quickbooksIntegration!.credentials[0]!.encryptedSecret)
    ) as {
      realmId?: string;
      accessToken?: string;
      refreshToken?: string;
      accessTokenExpiresAt?: string;
      refreshTokenExpiresAt?: string;
      connectedByUserId?: string | null;
    };
    assert(storedCredential.realmId === "realm-123", "Expected realmId to persist on OAuth callback.");
    assert(storedCredential.accessToken === "oauth-access-token", "Expected access token to persist.");
    assert(storedCredential.refreshToken === "oauth-refresh-token", "Expected refresh token to persist.");
    assert(storedCredential.connectedByUserId === adminUserId, "Expected connectedByUserId to persist.");

    const missingAuthResponse = await fetch(`${baseUrl}/api/internal/order-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        internal_source: "store",
        internal_order_id: "order-unauthorized",
        internal_order_number: "1000",
        currency: "USD",
        total_amount: 10,
      }),
    });
    assert(missingAuthResponse.status === 401, `Expected missing auth to return 401, got ${missingAuthResponse.status}`);

    const apiKey = await createFirmApiKey({
      firmId,
      name: "QuickBooks intake",
      scopes: "order_sync",
    });

    const unsafePayloadResponse = await fetch(`${baseUrl}/api/internal/order-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        internal_source: "store",
        internal_order_id: "order-unsafe",
        internal_order_number: "1001",
        currency: "USD",
        total_amount: 25,
        billing_email: "unsafe@example.com",
        product_names: ["Should not be here"],
      }),
    });
    assert(unsafePayloadResponse.status === 400, `Expected unsafe payload to return 400, got ${unsafePayloadResponse.status}`);

    const missingEmailResponse = await fetch(`${baseUrl}/api/internal/order-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        internal_source: "store",
        internal_order_id: "order-missing-email",
        internal_order_number: "1002",
        currency: "USD",
        total_amount: 40,
        customer_first_name: "No",
        customer_last_name: "Email",
      }),
    });
    assert(missingEmailResponse.status === 409, `Expected missing billing email to return 409, got ${missingEmailResponse.status}`);
    const missingEmailSync = await prisma.quickbooksInvoiceSync.findUnique({
      where: {
        firmId_sourceSystem_sourceOrderId: {
          firmId,
          sourceSystem: "store",
          sourceOrderId: "order-missing-email",
        },
      },
    });
    assert(missingEmailSync !== null, "Expected missing-email sync record to persist.");
    assert(
      missingEmailSync!.invoiceStatus === QuickbooksInvoiceStatus.FAILED,
      `Expected missing-email sync to be FAILED, got ${missingEmailSync!.invoiceStatus}`
    );
    assert(
      missingEmailSync!.lastSyncError?.includes("Billing email is required") === true,
      `Expected missing-email sync to record a clean error, got ${missingEmailSync!.lastSyncError}`
    );

    const happyPathPayload = {
      internal_source: "store",
      internal_order_id: "order-1003",
      internal_order_number: "1003",
      created_at: "2026-04-21T10:15:00-04:00",
      currency: "USD",
      total_amount: "125.50",
      customer_first_name: "Jamie",
      customer_last_name: "Rivera",
      billing_email: "jamie@example.com",
      neutral_internal_note: "Neutral reconciliation note",
      internal_metadata: {
        ref_batch: "batch-77",
        retry_count: 0,
      },
    };

    const firstSyncResponse = await fetch(`${baseUrl}/api/internal/order-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(happyPathPayload),
    });
    assert(firstSyncResponse.status === 201, `Expected first happy-path sync to return 201, got ${firstSyncResponse.status}`);
    const firstSyncJson = (await firstSyncResponse.json()) as { ok?: boolean; created?: boolean; sync?: { id?: string; invoiceStatus?: string; qboInvoiceId?: string | null } };
    assert(firstSyncJson.ok === true && firstSyncJson.created === true, "Expected first happy-path sync to create a new record.");
    assert(
      firstSyncJson.sync?.invoiceStatus === "EMAILED" && firstSyncJson.sync?.qboInvoiceId === "qbo-invoice-1",
      `Expected first happy-path sync to reach EMAILED with qbo invoice id, got ${JSON.stringify(firstSyncJson.sync)}`
    );

    const duplicateSyncResponse = await fetch(`${baseUrl}/api/internal/order-sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(happyPathPayload),
    });
    assert(duplicateSyncResponse.status === 200, `Expected duplicate sync to return 200, got ${duplicateSyncResponse.status}`);
    const duplicateSyncJson = (await duplicateSyncResponse.json()) as { ok?: boolean; created?: boolean; sync?: { invoiceStatus?: string; qboInvoiceId?: string | null } };
    assert(duplicateSyncJson.ok === true && duplicateSyncJson.created === false, "Expected duplicate sync to reuse existing state.");
    assert(
      duplicateSyncJson.sync?.invoiceStatus === "EMAILED" && duplicateSyncJson.sync?.qboInvoiceId === "qbo-invoice-1",
      `Expected duplicate sync to return the existing invoice state, got ${JSON.stringify(duplicateSyncJson.sync)}`
    );

    assert(customerCreateCount === 1, `Expected customer to be created once, got ${customerCreateCount}`);
    assert(itemCreateCount === 1, `Expected neutral item to be created once, got ${itemCreateCount}`);
    assert(invoiceCreateCount === 1, `Expected invoice to be created once, got ${invoiceCreateCount}`);
    assert(invoiceSendCalls.length === 1, `Expected invoice send to happen once on first sync, got ${invoiceSendCalls.length}`);
    assert(
      eventOrder.indexOf("invoice_create") !== -1 &&
        eventOrder.indexOf("invoice_send") !== -1 &&
        eventOrder.indexOf("invoice_create") < eventOrder.indexOf("invoice_send"),
      `Expected invoice send after invoice create, got ${eventOrder.join(" -> ")}`
    );

    const invoicePayload = invoiceCreateBodies[0] ?? {};
    const invoicePayloadJson = JSON.stringify(invoicePayload);
    assert(
      invoicePayloadJson.includes("OnyxIntel invoice"),
      `Expected invoice payload to use the neutral OnyxIntel line description, got ${invoicePayloadJson}`
    );
    assert(
      !/Miami Science|peptide|batch-77|order-1003|Neutral reconciliation note/i.test(invoicePayloadJson),
      `Expected no source/product wording in customer-facing invoice payload, got ${invoicePayloadJson}`
    );

    const expiredCredentialEncrypted = quickbooksIntegration!.credentials[0]!.encryptedSecret;
    const expiredCredential = JSON.parse(decryptSecret(expiredCredentialEncrypted)) as Record<string, string>;
    expiredCredential.accessToken = "expired-access-token";
    expiredCredential.refreshToken = "still-valid-refresh-token";
    expiredCredential.accessTokenExpiresAt = new Date(Date.now() - 60_000).toISOString();
    await prisma.integrationCredential.update({
      where: { id: quickbooksIntegration!.credentials[0]!.id },
      data: {
        encryptedSecret: encryptSecret(JSON.stringify(expiredCredential)),
      },
    });

    const refreshedConnection = await ensureFreshQuickbooksConnection({ firmId, requestId: "refresh-test" });
    assert(
      refreshedConnection.accessToken === "refreshed-access-token",
      `Expected token refresh to return the latest access token, got ${refreshedConnection.accessToken}`
    );
    assert(
      tokenCalls.some((body) => body.includes("refresh_token=still-valid-refresh-token")),
      "Expected token refresh helper to call Intuit with the stored refresh token."
    );

    const adminToken = signToken({
      userId: adminUserId,
      firmId,
      role: Role.FIRM_ADMIN,
      email: "quickbooks-admin@example.com",
    });
    const syncRow = await prisma.quickbooksInvoiceSync.findUnique({
      where: {
        firmId_sourceSystem_sourceOrderId: {
          firmId,
          sourceSystem: "store",
          sourceOrderId: "order-1003",
        },
      },
    });
    assert(syncRow !== null, "Expected sync row to exist for resend validation.");

    const resendResponse = await fetch(`${baseUrl}/me/quickbooks/invoice-syncs/${syncRow!.id}/resend`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert(resendResponse.status === 200, `Expected resend route to return 200, got ${resendResponse.status}`);
    assert(invoiceCreateCount === 1, `Expected resend route not to create a second invoice, got ${invoiceCreateCount}`);
    assert(invoiceSendCalls.length === 2, `Expected resend route to trigger invoice send again, got ${invoiceSendCalls.length}`);
  } finally {
    globalThis.fetch = originalFetch;
    await stopTestServer(server);

    await prisma.quickbooksInvoiceSync.deleteMany({ where: { firmId } }).catch(() => {});
    const integrations = await prisma.firmIntegration.findMany({
      where: { firmId, provider: IntegrationProvider.QUICKBOOKS },
      select: { id: true },
    });
    const integrationIds = integrations.map((integration) => integration.id);
    if (integrationIds.length > 0) {
      await prisma.integrationCredential.deleteMany({ where: { integrationId: { in: integrationIds } } }).catch(() => {});
      await prisma.integrationSyncLog.deleteMany({ where: { integrationId: { in: integrationIds } } }).catch(() => {});
    }
    await prisma.firmIntegration.deleteMany({ where: { firmId, provider: IntegrationProvider.QUICKBOOKS } }).catch(() => {});
    await prisma.apiKey.deleteMany({ where: { firmId } }).catch(() => {});
    await prisma.systemErrorLog.deleteMany({ where: { firmId, area: "quickbooks" } }).catch(() => {});
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
