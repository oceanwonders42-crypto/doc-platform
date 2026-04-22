import assert from "node:assert/strict";
import { GET } from "./route";

type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

async function main() {
  const originalFetch = global.fetch;
  const originalDocApiUrl = process.env.DOC_API_URL;
  const originalDocApiKey = process.env.DOC_API_KEY;

  try {
    process.env.DOC_API_URL = "https://api.example.test";
    process.env.DOC_API_KEY = "sk_live_proxy";

    let lastUpstreamAuth = "";
    let lastUrl = "";

    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      lastUrl = String(input);
      const headers = new Headers(init?.headers ?? {});
      lastUpstreamAuth = headers.get("authorization") ?? "";
      return Response.json(
        {
          items: [
            {
              id: "doc_1",
              originalName: "records.pdf",
            },
          ],
          nextCursor: null,
        },
        { status: 200 }
      );
    }) as typeof fetch;

    const successRequest = new Request("https://web.example.test/api/documents?limit=2&caseId=case_123", {
      headers: {
        authorization: "Bearer jwt-session-token",
      },
    });
    const successPayload = await readJson(await GET(successRequest));

    assert.equal(lastUrl, "https://api.example.test/me/documents?limit=2&caseId=case_123");
    assert.equal(lastUpstreamAuth, "Bearer jwt-session-token");
    assert.equal(successPayload.ok, true);
    assert.equal(successPayload.success, true);
    assert.deepEqual(successPayload.items, successPayload.documents);
    assert.equal(Array.isArray(successPayload.documents), true);

    global.fetch = (async () =>
      new Response("<html><body>413 Request Entity Too Large</body></html>", {
        status: 413,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })) as typeof fetch;

    const htmlPayload = await readJson(await GET(new Request("https://web.example.test/api/documents?limit=2")));
    assert.equal(htmlPayload.ok, false);
    assert.equal(htmlPayload.success, false);
    assert.equal(htmlPayload.code, "DOCUMENTS_UPSTREAM_HTML");
    assert.equal(htmlPayload.upstreamStatus, 413);

    delete process.env.DOC_API_KEY;
    let fallbackAuth = "";
    global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      fallbackAuth = new Headers(init?.headers ?? {}).get("authorization") ?? "";
      return Response.json({ documents: [] }, { status: 200 });
    }) as typeof fetch;

    const tokenlessPayload = await readJson(await GET(new Request("https://web.example.test/api/documents")));
    assert.equal(fallbackAuth, "");
    assert.equal(tokenlessPayload.ok, false);
    assert.equal(tokenlessPayload.success, false);
    assert.equal(tokenlessPayload.code, "DOCUMENTS_PROXY_NOT_CONFIGURED");

    process.env.DOC_API_KEY = "sk_live_proxy";
    let apiKeyFallbackAuth = "";
    global.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      apiKeyFallbackAuth = new Headers(init?.headers ?? {}).get("authorization") ?? "";
      return Response.json({ documents: [] }, { status: 200 });
    }) as typeof fetch;

    const apiKeyPayload = await readJson(await GET(new Request("https://web.example.test/api/documents")));
    assert.equal(apiKeyFallbackAuth, "Bearer sk_live_proxy");
    assert.equal(apiKeyPayload.ok, true);
    assert.equal(apiKeyPayload.success, true);
    assert.deepEqual(apiKeyPayload.items, []);
    assert.deepEqual(apiKeyPayload.documents, []);

    console.log("Documents proxy route contract checks passed", {
      successKeys: Object.keys(successPayload),
      htmlCode: htmlPayload.code,
      fallbackCode: tokenlessPayload.code,
      apiKeyFallbackAuth,
    });
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
