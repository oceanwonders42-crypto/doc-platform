import assert from "node:assert/strict";
import { POST as createFirmRoute } from "./firms/route";
import { POST as createMailboxRoute } from "./mailboxes/route";

type FetchCall = {
  input: string;
  init?: RequestInit;
};

function getHeader(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return entry?.[1] ?? null;
  }
  const value = (headers as Record<string, string | undefined>)[name] ??
    (headers as Record<string, string | undefined>)[name.toLowerCase()];
  return typeof value === "string" ? value : null;
}

async function main() {
  const originalFetch = global.fetch;
  const originalDocApiUrl = process.env.DOC_API_URL;
  process.env.DOC_API_URL = "http://api.test";

  try {
    let calls: FetchCall[] = [];

    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return Response.json({ ok: true });
    }) as typeof fetch;

    const unauthenticatedFirmResponse = await createFirmRoute(
      new Request("http://localhost/api/onboarding/firms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blocked Firm", plan: "starter" }),
      })
    );
    assert.equal(unauthenticatedFirmResponse.status, 401, "Missing auth should be rejected before proxying onboarding firm creation.");
    assert.equal(calls.length, 0, "Missing auth should not call the upstream API.");

    calls = [];
    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return Response.json({ ok: true, role: "STAFF", isPlatformAdmin: false }, { status: 200 });
    }) as typeof fetch;

    const nonAdminMailboxResponse = await createMailboxRoute(
      new Request("http://localhost/api/onboarding/mailboxes", {
        method: "POST",
        headers: {
          Authorization: "Bearer staff-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: "sk_live_test",
          imapHost: "imap.example.com",
          imapUsername: "user@example.com",
          imapPassword: "app-password",
        }),
      })
    );
    assert.equal(nonAdminMailboxResponse.status, 403, "Non-admin callers should be blocked from onboarding mailbox setup.");
    assert.equal(calls.length, 1, "Non-admin onboarding access should only hit auth verification.");
    assert.equal(calls[0]?.input, "http://api.test/auth/me");

    calls = [];
    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      if (calls.length === 1) {
        return Response.json({ ok: true, role: "PLATFORM_ADMIN", isPlatformAdmin: true }, { status: 200 });
      }
      return Response.json({ ok: true, firm: { id: "firm_123" } }, { status: 200 });
    }) as typeof fetch;

    const adminFirmResponse = await createFirmRoute(
      new Request("http://localhost/api/onboarding/firms", {
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Allowed Firm", plan: "starter" }),
      })
    );
    assert.equal(adminFirmResponse.status, 200, "Platform admins should still be able to create firms through the onboarding proxy.");
    assert.equal(calls.length, 2, "Allowed onboarding access should verify auth once and then proxy the request.");
    assert.equal(calls[0]?.input, "http://api.test/auth/me");
    assert.equal(calls[1]?.input, "http://api.test/firms");
    assert.equal(getHeader(calls[1]?.init, "Authorization"), "Bearer admin-token", "The onboarding proxy should forward the caller's auth, not a hidden admin key.");

    console.log("Onboarding route auth proof passed", {
      unauthorizedStatus: unauthenticatedFirmResponse.status,
      nonAdminStatus: nonAdminMailboxResponse.status,
      adminStatus: adminFirmResponse.status,
      proxiedAuthorization: getHeader(calls[1]?.init, "Authorization"),
    });
  } finally {
    global.fetch = originalFetch;
    if (originalDocApiUrl == null) delete process.env.DOC_API_URL;
    else process.env.DOC_API_URL = originalDocApiUrl;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
