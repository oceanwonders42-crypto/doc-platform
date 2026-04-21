import assert from "node:assert/strict";
import { GET } from "./route";

type StatusPayload = {
  ok: boolean;
  env?: {
    apiTargetsMatch?: boolean | null;
  };
  featureFlags?: {
    ok: boolean;
    flags: {
      emailAutomation: boolean | null;
    };
  };
  apiHealth?: {
    ok: boolean;
    status: number;
  };
  checks?: Array<{
    id: string;
    status: "pass" | "warn" | "fail";
  }>;
};

function getCheck(payload: StatusPayload, id: string) {
  const check = payload.checks?.find((entry) => entry.id === id);
  assert(check, `Expected check ${id} to be present.`);
  return check;
}

async function readJson(response: Response): Promise<StatusPayload> {
  return (await response.json()) as StatusPayload;
}

async function main() {
  const originalFetch = global.fetch;
  const originalDocApiUrl = process.env.DOC_API_URL;
  const originalDocApiKey = process.env.DOC_API_KEY;
  const originalNextPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalDocWebBaseUrl = process.env.DOC_WEB_BASE_URL;

  try {
    delete process.env.DOC_API_URL;
    delete process.env.DOC_API_KEY;
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.DOC_WEB_BASE_URL;
    global.fetch = originalFetch;

    const missingPayload = await readJson(await GET());
    assert.equal(missingPayload.ok, false, "Missing required env should fail the debug status route.");
    assert.equal(getCheck(missingPayload, "doc_api_url").status, "fail");
    assert.equal(getCheck(missingPayload, "doc_api_key").status, "fail");
    assert.equal(getCheck(missingPayload, "next_public_api_url").status, "warn");

    process.env.DOC_API_URL = "https://api.example.test";
    process.env.DOC_API_KEY = "sk_live_test";
    process.env.NEXT_PUBLIC_API_URL = "https://api.other.test";
    process.env.DOC_WEB_BASE_URL = "https://web.example.test";

    global.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://api.example.test/health") {
        return Response.json({
          ok: true,
          build: {
            versionLabel: "main@api1234567890",
            packageName: "api",
            packageVersion: "1.0.0",
            sha: "api1234567890abcdef",
            shortSha: "api1234567890",
            builtAt: "2026-04-21T12:00:00.000Z",
            source: "runtime-env",
            branch: "main",
            dirty: false,
          },
        });
      }
      if (url === "https://api.example.test/me/features") {
        return Response.json({
          insurance_extraction: true,
          court_extraction: false,
          demand_narratives: true,
          duplicates_detection: true,
          email_automation: true,
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    }) as typeof fetch;

    const mismatchPayload = await readJson(await GET());
    assert.equal(mismatchPayload.ok, false, "Mismatched API targets should surface as a failing status.");
    assert.equal(mismatchPayload.env?.apiTargetsMatch, false);
    assert.equal(getCheck(mismatchPayload, "api_target_match").status, "fail");
    assert.equal(getCheck(mismatchPayload, "api_health").status, "pass");
    assert.equal(getCheck(mismatchPayload, "api_feature_flags").status, "pass");
    assert.equal(mismatchPayload.apiHealth?.ok, true);
    assert.equal(mismatchPayload.apiHealth?.status, 200);
    assert.equal(mismatchPayload.featureFlags?.ok, true);
    assert.equal(mismatchPayload.featureFlags?.flags.emailAutomation, true);

    console.log("Debug status route env audit checks passed", {
      missingDocApiUrl: getCheck(missingPayload, "doc_api_url").status,
      mismatchedTargets: getCheck(mismatchPayload, "api_target_match").status,
      featureFlags: mismatchPayload.featureFlags?.flags,
    });
  } finally {
    global.fetch = originalFetch;
    if (originalDocApiUrl == null) delete process.env.DOC_API_URL;
    else process.env.DOC_API_URL = originalDocApiUrl;
    if (originalDocApiKey == null) delete process.env.DOC_API_KEY;
    else process.env.DOC_API_KEY = originalDocApiKey;
    if (originalNextPublicApiUrl == null) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalNextPublicApiUrl;
    if (originalDocWebBaseUrl == null) delete process.env.DOC_WEB_BASE_URL;
    else process.env.DOC_WEB_BASE_URL = originalDocWebBaseUrl;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
