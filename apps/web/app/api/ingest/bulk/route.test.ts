import assert from "node:assert/strict";

import { POST } from "./route";

type UploadErrorPayload = {
  ok?: boolean;
  code?: string;
  error?: string;
  upstreamStatus?: number;
};

async function main() {
  const originalFetch = global.fetch;
  const originalDocApiUrl = process.env.DOC_API_URL;

  process.env.DOC_API_URL = "https://api.example.test";

  try {
    const missingAuthForm = new FormData();
    missingAuthForm.append("files", new File(["hello"], "records.pdf", { type: "application/pdf" }));
    const missingAuthResponse = await POST(
      new Request("https://web.example.test/api/ingest/bulk", {
        method: "POST",
        body: missingAuthForm,
      })
    );
    assert.equal(missingAuthResponse.status, 401);
    const missingAuthJson = (await missingAuthResponse.json()) as UploadErrorPayload;
    assert.equal(missingAuthJson.ok, false);
    assert.equal(missingAuthJson.code, "UNAUTHORIZED");

    let lastUrl = "";
    let lastAuth = "";
    global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      lastUrl = String(input);
      lastAuth = new Headers(init?.headers ?? {}).get("authorization") ?? "";
      return Response.json(
        { ok: true, documentIds: ["doc_123"], duplicateIndices: [], errors: [] },
        { status: 200 }
      );
    }) as typeof fetch;

    const successForm = new FormData();
    successForm.append("files", new File(["hello"], "records.pdf", { type: "application/pdf" }));
    const successResponse = await POST(
      new Request("https://web.example.test/api/ingest/bulk", {
        method: "POST",
        headers: {
          authorization: "Bearer session-token",
        },
        body: successForm,
      })
    );
    assert.equal(lastUrl, "https://api.example.test/me/ingest/bulk");
    assert.equal(lastAuth, "Bearer session-token");
    assert.equal(successResponse.status, 200);
    const successJson = (await successResponse.json()) as { ok?: boolean; documentIds?: string[] };
    assert.equal(successJson.ok, true);
    assert.deepEqual(successJson.documentIds, ["doc_123"]);

    global.fetch = (async () =>
      new Response("<html><body>not json</body></html>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })) as typeof fetch;

    const htmlForm = new FormData();
    htmlForm.append("files", new File(["hello"], "records.pdf", { type: "application/pdf" }));
    const htmlResponse = await POST(
      new Request("https://web.example.test/api/ingest/bulk", {
        method: "POST",
        headers: {
          authorization: "Bearer session-token",
        },
        body: htmlForm,
      })
    );
    assert.equal(htmlResponse.status, 404);
    const htmlJson = (await htmlResponse.json()) as UploadErrorPayload;
    assert.equal(htmlJson.ok, false);
    assert.equal(htmlJson.code, "BAD_UPSTREAM_RESPONSE");
    assert.equal(htmlJson.upstreamStatus, 404);

    console.log("ingest bulk proxy route tests passed");
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
