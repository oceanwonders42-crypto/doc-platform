import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type FeatureFlagsResponse = {
  insurance_extraction: boolean;
  court_extraction: boolean;
  demand_narratives: boolean;
  duplicates_detection: boolean;
  email_automation: boolean;
};

const DEFAULT_FEATURE_FLAGS: FeatureFlagsResponse = {
  insurance_extraction: false,
  court_extraction: false,
  demand_narratives: false,
  duplicates_detection: false,
  email_automation: false,
};

function normalizeFeatureFlags(data: unknown): FeatureFlagsResponse {
  const record = (data ?? {}) as Record<string, unknown>;
  return {
    insurance_extraction: Boolean(record.insurance_extraction),
    court_extraction: Boolean(record.court_extraction),
    demand_narratives: Boolean(record.demand_narratives),
    duplicates_detection: Boolean(record.duplicates_detection),
    email_automation: Boolean(record.email_automation),
  };
}

function getForwardedAuthorizationHeader(req: Request): string | null {
  const authorization = req.headers.get("authorization");
  return authorization && authorization.trim().length > 0 ? authorization.trim() : null;
}

export async function GET(req: Request) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base) {
    return NextResponse.json(
      { error: "Missing DOC_API_URL", ...DEFAULT_FEATURE_FLAGS },
      { status: 500 }
    );
  }

  const authorization = getForwardedAuthorizationHeader(req) ?? (key ? `Bearer ${key}` : null);
  if (!authorization) {
    return NextResponse.json(
      { error: "Missing caller Authorization header and DOC_API_KEY fallback", ...DEFAULT_FEATURE_FLAGS },
      { status: 500 }
    );
  }

  const res = await fetch(`${base}/me/features`, {
    headers: { Authorization: authorization },
    cache: "no-store",
  }).catch(() => null);
  if (!res) {
    return NextResponse.json(
      { error: "Upstream failed", ...DEFAULT_FEATURE_FLAGS },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error =
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Failed to load feature flags";
    return NextResponse.json(
      { error, ...DEFAULT_FEATURE_FLAGS },
      { status: res.status }
    );
  }

  return NextResponse.json(normalizeFeatureFlags(data));
}
