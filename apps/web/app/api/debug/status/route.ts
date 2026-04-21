import { NextResponse } from "next/server";
import { getBuildInfo } from "../../../../lib/buildInfo";
import { parseJsonResponse } from "../../../../lib/api";

export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "warn" | "fail";

type StatusCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

type BuildSnapshot = {
  versionLabel: string;
  packageName: string;
  packageVersion: string;
  commitHash: string;
  shortCommitHash: string;
  buildTime: string | null;
  buildSource: string;
  buildBranch: string | null;
  buildDirty: boolean | null;
};

type FeatureFlagsSnapshot = {
  ok: boolean;
  error: string | null;
  flags: {
    insuranceExtraction: boolean | null;
    courtExtraction: boolean | null;
    demandNarratives: boolean | null;
    duplicatesDetection: boolean | null;
    emailAutomation: boolean | null;
  };
};

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function normalizeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function createCheck(id: string, label: string, status: CheckStatus, detail: string): StatusCheck {
  return { id, label, status, detail };
}

function toBuildSnapshot(value: unknown): BuildSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const commitHash =
    typeof record.commitHash === "string" && record.commitHash.trim()
      ? record.commitHash.trim()
      : typeof record.sha === "string" && record.sha.trim()
        ? record.sha.trim()
        : "unknown";
  const shortCommitHash =
    typeof record.shortCommitHash === "string" && record.shortCommitHash.trim()
      ? record.shortCommitHash.trim()
      : typeof record.shortSha === "string" && record.shortSha.trim()
        ? record.shortSha.trim()
        : commitHash === "unknown"
          ? "unknown"
          : commitHash.slice(0, 12);

  return {
    versionLabel:
      typeof record.versionLabel === "string" && record.versionLabel.trim()
        ? record.versionLabel.trim()
        : `detached@${shortCommitHash}`,
    packageName:
      typeof record.packageName === "string" && record.packageName.trim() ? record.packageName.trim() : "unknown",
    packageVersion:
      typeof record.packageVersion === "string" && record.packageVersion.trim()
        ? record.packageVersion.trim()
        : "unknown",
    commitHash,
    shortCommitHash,
    buildTime:
      typeof record.buildTime === "string" && record.buildTime.trim()
        ? record.buildTime.trim()
        : typeof record.builtAt === "string" && record.builtAt.trim()
          ? record.builtAt.trim()
          : null,
    buildSource:
      typeof record.buildSource === "string" && record.buildSource.trim()
        ? record.buildSource.trim()
        : typeof record.source === "string" && record.source.trim()
          ? record.source.trim()
          : "runtime-env",
    buildBranch:
      typeof record.buildBranch === "string" && record.buildBranch.trim()
        ? record.buildBranch.trim()
        : typeof record.branch === "string" && record.branch.trim()
          ? record.branch.trim()
          : null,
    buildDirty:
      typeof record.buildDirty === "boolean"
        ? record.buildDirty
        : typeof record.dirty === "boolean"
          ? record.dirty
          : null,
  };
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: unknown; error: string | null }> {
  try {
    const response = await fetch(url, { cache: "no-store", ...init });
    const body = await response.clone().text();
    if (!body.trim()) {
      return {
        ok: response.ok,
        status: response.status,
        data: null,
        error: response.ok ? null : `HTTP ${response.status}`,
      };
    }

    try {
      const data = await parseJsonResponse(response);
      const error =
        !response.ok && data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
          ? ((data as { error: string }).error || `HTTP ${response.status}`)
          : !response.ok
            ? `HTTP ${response.status}`
            : null;
      return { ok: response.ok, status: response.status, data, error };
    } catch (error) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: error instanceof Error ? error.message : `Invalid JSON from ${url}`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const docApiUrl = readEnv("DOC_API_URL");
  const docApiKey = readEnv("DOC_API_KEY");
  const nextPublicApiUrl = readEnv("NEXT_PUBLIC_API_URL");
  const docWebBaseUrl = readEnv("DOC_WEB_BASE_URL");

  const normalizedDocApiUrl = normalizeUrl(docApiUrl);
  const normalizedNextPublicApiUrl = normalizeUrl(nextPublicApiUrl);
  const apiTargetsMatch =
    normalizedDocApiUrl && normalizedNextPublicApiUrl
      ? normalizedDocApiUrl === normalizedNextPublicApiUrl
      : null;

  const webBuild = toBuildSnapshot(getBuildInfo());

  const [healthResult, featuresResult] = await Promise.all([
    normalizedDocApiUrl
      ? fetchJson(`${normalizedDocApiUrl}/health`, {
          headers: { Accept: "application/json" },
        })
      : Promise.resolve(null),
    normalizedDocApiUrl && docApiKey
      ? fetchJson(`${normalizedDocApiUrl}/me/features`, {
          headers: {
            Authorization: `Bearer ${docApiKey}`,
            Accept: "application/json",
          },
        })
      : Promise.resolve(null),
  ]);

  const apiHealth = {
    ok:
      healthResult?.ok === true &&
      healthResult.data &&
      typeof healthResult.data === "object" &&
      (((healthResult.data as { ok?: unknown }).ok as boolean | string | undefined) === true ||
        ((healthResult.data as { ok?: unknown }).ok as boolean | string | undefined) === "true"),
    status: healthResult?.status ?? 0,
    error: healthResult?.error ?? null,
    build:
      healthResult?.data && typeof healthResult.data === "object"
        ? toBuildSnapshot((healthResult.data as { build?: unknown }).build)
        : null,
  };

  const featureFlags: FeatureFlagsSnapshot = {
    ok: Boolean(featuresResult?.ok),
    error: featuresResult?.error ?? null,
    flags: {
      insuranceExtraction:
        featuresResult?.data && typeof featuresResult.data === "object"
          ? Boolean((featuresResult.data as { insurance_extraction?: unknown }).insurance_extraction)
          : null,
      courtExtraction:
        featuresResult?.data && typeof featuresResult.data === "object"
          ? Boolean((featuresResult.data as { court_extraction?: unknown }).court_extraction)
          : null,
      demandNarratives:
        featuresResult?.data && typeof featuresResult.data === "object"
          ? Boolean((featuresResult.data as { demand_narratives?: unknown }).demand_narratives)
          : null,
      duplicatesDetection:
        featuresResult?.data && typeof featuresResult.data === "object"
          ? Boolean((featuresResult.data as { duplicates_detection?: unknown }).duplicates_detection)
          : null,
      emailAutomation:
        featuresResult?.data && typeof featuresResult.data === "object"
          ? Boolean((featuresResult.data as { email_automation?: unknown }).email_automation)
          : null,
    },
  };

  const checks: StatusCheck[] = [];

  checks.push(
    !docApiUrl
      ? createCheck("doc_api_url", "DOC_API_URL", "fail", "Missing. Server-side web routes cannot reach the API.")
      : !normalizedDocApiUrl
        ? createCheck("doc_api_url", "DOC_API_URL", "fail", "Present but not a valid absolute URL.")
        : createCheck("doc_api_url", "DOC_API_URL", "pass", `Using ${normalizedDocApiUrl}.`)
  );

  checks.push(
    !docApiKey
      ? createCheck("doc_api_key", "DOC_API_KEY", "fail", "Missing. Authenticated server-side web routes will fail.")
      : createCheck("doc_api_key", "DOC_API_KEY", "pass", "Set for authenticated server-side proxy calls.")
  );

  checks.push(
    !nextPublicApiUrl
      ? createCheck(
          "next_public_api_url",
          "NEXT_PUBLIC_API_URL",
          nodeEnv === "production" ? "fail" : "warn",
          "Missing. The browser bundle needs this at build time; development only has a localhost fallback."
        )
      : !normalizedNextPublicApiUrl
        ? createCheck("next_public_api_url", "NEXT_PUBLIC_API_URL", "fail", "Present but not a valid absolute URL.")
        : createCheck(
            "next_public_api_url",
            "NEXT_PUBLIC_API_URL",
            "pass",
            `Client bundle target is ${normalizedNextPublicApiUrl}.`
          )
  );

  checks.push(
    !docWebBaseUrl
      ? createCheck(
          "doc_web_base_url",
          "DOC_WEB_BASE_URL",
          nodeEnv === "production" ? "warn" : "warn",
          "Unset. Some server-rendered internal links and absolute debug fetches may fall back to localhost-style defaults."
        )
      : !normalizeUrl(docWebBaseUrl)
        ? createCheck("doc_web_base_url", "DOC_WEB_BASE_URL", "fail", "Present but not a valid absolute URL.")
        : createCheck("doc_web_base_url", "DOC_WEB_BASE_URL", "pass", `Using ${normalizeUrl(docWebBaseUrl)}.`)
  );

  checks.push(
    apiTargetsMatch == null
      ? createCheck(
          "api_target_match",
          "Web/API target consistency",
          "warn",
          "Could not compare DOC_API_URL and NEXT_PUBLIC_API_URL because one of them is missing or invalid."
        )
      : apiTargetsMatch
        ? createCheck(
            "api_target_match",
            "Web/API target consistency",
            "pass",
            "DOC_API_URL and NEXT_PUBLIC_API_URL point to the same API origin."
          )
        : createCheck(
            "api_target_match",
            "Web/API target consistency",
            "fail",
            "DOC_API_URL and NEXT_PUBLIC_API_URL point to different API origins. Server-rendered and client-side requests can diverge."
          )
  );

  checks.push(
    !normalizedDocApiUrl
      ? createCheck("api_health", "API health", "warn", "Skipped until DOC_API_URL is set to a valid absolute URL.")
      : apiHealth.ok
        ? createCheck("api_health", "API health", "pass", `Health check passed with HTTP ${apiHealth.status}.`)
        : createCheck(
            "api_health",
            "API health",
            "fail",
            apiHealth.error || `Health check failed with HTTP ${apiHealth.status}.`
          )
  );

  checks.push(
    !normalizedDocApiUrl || !docApiKey
      ? createCheck(
          "api_feature_flags",
          "API feature flags",
          "warn",
          "Skipped until DOC_API_URL and DOC_API_KEY are both configured."
        )
      : featureFlags.ok
        ? createCheck(
            "api_feature_flags",
            "API feature flags",
            "pass",
            `EMAIL_AUTOMATION_ENABLED resolves to ${featureFlags.flags.emailAutomation ? "enabled" : "disabled"}.`
          )
        : createCheck(
            "api_feature_flags",
            "API feature flags",
            "fail",
            featureFlags.error || "Failed to fetch /me/features with DOC_API_KEY."
          )
  );

  checks.push(
    webBuild && webBuild.commitHash !== "unknown" && webBuild.buildTime
      ? createCheck(
          "web_build_metadata",
          "Web build metadata",
          "pass",
          `${webBuild.versionLabel} built ${webBuild.buildTime}.`
        )
      : createCheck(
          "web_build_metadata",
          "Web build metadata",
          "warn",
          "Web build metadata is incomplete. Set DOC_BUILD_* or provide build-meta.json during deploys."
        )
  );

  checks.push(
    !apiHealth.build
      ? createCheck(
          "api_build_metadata",
          "API build metadata",
          apiHealth.ok ? "warn" : "warn",
          "API build metadata is unavailable because /health did not return a build snapshot."
        )
      : apiHealth.build.commitHash !== "unknown" && apiHealth.build.buildTime
        ? createCheck(
            "api_build_metadata",
            "API build metadata",
            "pass",
            `${apiHealth.build.versionLabel} built ${apiHealth.build.buildTime}.`
          )
        : createCheck(
            "api_build_metadata",
            "API build metadata",
            "warn",
            "API build metadata is incomplete. Set DOC_BUILD_* or provide build-meta.json during deploys."
          )
  );

  checks.push(
    !webBuild || !apiHealth.build
      ? createCheck(
          "deploy_version_match",
          "Web/API deploy parity",
          "warn",
          "Unable to compare web and API build versions."
        )
      : webBuild.commitHash === "unknown" || apiHealth.build.commitHash === "unknown"
        ? createCheck(
            "deploy_version_match",
          "Web/API deploy parity",
          "warn",
          "Web or API commit hash is unknown, so deploy parity cannot be confirmed."
        )
        : webBuild.commitHash === apiHealth.build.commitHash &&
            webBuild.buildSource === apiHealth.build.buildSource &&
            webBuild.buildDirty === apiHealth.build.buildDirty
          ? createCheck(
              "deploy_version_match",
              "Web/API deploy parity",
              "pass",
              `Both services report commit ${webBuild.shortCommitHash} with source=${webBuild.buildSource} and dirty=${String(webBuild.buildDirty)}.`
            )
          : createCheck(
              "deploy_version_match",
              "Web/API deploy parity",
              "fail",
              `Web reports ${webBuild.shortCommitHash} (${webBuild.buildSource}, dirty=${String(webBuild.buildDirty)}) while API reports ${apiHealth.build.shortCommitHash} (${apiHealth.build.buildSource}, dirty=${String(apiHealth.build.buildDirty)}).`
            )
  );

  const failureCount = checks.filter((check) => check.status === "fail").length;
  const warningCount = checks.filter((check) => check.status === "warn").length;

  return NextResponse.json({
    ok: failureCount === 0,
    error: failureCount > 0 ? `${failureCount} runtime configuration checks failed.` : undefined,
    summary: {
      failureCount,
      warningCount,
      passCount: checks.length - failureCount - warningCount,
    },
    env: {
      nodeEnv,
      docApiUrl,
      docApiKeySet: Boolean(docApiKey),
      nextPublicApiUrl,
      docWebBaseUrl,
      apiTargetsMatch,
    },
    apiHealth,
    featureFlags,
    build: {
      web: webBuild,
      api: apiHealth.build,
    },
    checks,
  });
}
