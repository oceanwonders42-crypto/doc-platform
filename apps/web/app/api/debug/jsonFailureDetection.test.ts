import assert from "node:assert/strict";

import { GET as pingGet } from "./ping/route";
import { GET as statusGet } from "./status/route";

function createHtmlResponse(): Response {
  return new Response("<!DOCTYPE html><html><body>wrong target</body></html>", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

async function main() {
  const originalFetch = global.fetch;
  const originalDocApiUrl = process.env.DOC_API_URL;
  const originalDocApiKey = process.env.DOC_API_KEY;

  process.env.DOC_API_URL = "http://api.test";
  process.env.DOC_API_KEY = "debug-test-key";

  try {
    global.fetch = (async (input: string | URL | Request) => {
      void input;
      return createHtmlResponse();
    }) as typeof fetch;

    const pingResponse = await pingGet();
    const pingData = (await pingResponse.json()) as {
      ok: boolean;
      status: number;
      error?: string;
      upstreamUrl?: string;
      upstreamContentType?: string | null;
    };
    assert.equal(pingData.ok, false);
    assert.equal(pingData.status, 200);
    assert.equal(pingData.upstreamUrl, "http://api.test/health");
    assert.equal(pingData.upstreamContentType, "text/html; charset=utf-8");
    assert.match(pingData.error ?? "", /HTML instead of JSON/);
    assert.match(pingData.error ?? "", /content-type text\/html/i);

    const statusResponse = await statusGet();
    const statusData = (await statusResponse.json()) as {
      ok: boolean;
      error?: string;
      apiHealth?: {
        ok: boolean;
        status: number;
        error?: string | null;
      };
      checks?: Array<{
        id: string;
        status: string;
        detail: string;
      }>;
    };
    assert.equal(statusData.ok, false);
    assert.equal(statusData.apiHealth?.status, 200);
    assert.match(statusData.apiHealth?.error ?? "", /HTML instead of JSON/);
    const apiHealthCheck = statusData.checks?.find((check) => check.id === "api_health");
    assert.equal(apiHealthCheck?.status, "fail");
    assert.match(apiHealthCheck?.detail ?? "", /HTML instead of JSON/);

    console.log("debug route JSON failure detection tests passed");
  } finally {
    global.fetch = originalFetch;
    if (originalDocApiUrl == null) delete process.env.DOC_API_URL;
    else process.env.DOC_API_URL = originalDocApiUrl;
    if (originalDocApiKey == null) delete process.env.DOC_API_KEY;
    else process.env.DOC_API_KEY = originalDocApiKey;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
