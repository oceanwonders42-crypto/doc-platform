import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getBearerAuthorization(req: NextRequest): string | null {
  const value = req.headers.get("authorization")?.trim();
  if (!value || !/^Bearer\s+\S+/i.test(value)) {
    return null;
  }
  return value;
}

function normalizeFeatures(data: Record<string, unknown>) {
  return {
    insurance_extraction: Boolean(data.insurance_extraction),
    court_extraction: Boolean(data.court_extraction),
    demand_narratives: Boolean(data.demand_narratives),
    duplicates_detection: Boolean(data.duplicates_detection),
    crm_sync: Boolean(data.crm_sync),
    crm_push: Boolean(data.crm_push),
    case_insights: Boolean(data.case_insights),
    email_automation: Boolean(data.email_automation),
  };
}

export async function GET(req: NextRequest) {
  const base = process.env.DOC_API_URL?.trim();
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_URL is not set" },
      { status: 500 }
    );
  }

  const authHeader = getBearerAuthorization(req);
  if (!authHeader) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(`${base}/me/features`, {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      return NextResponse.json(
        Object.keys(data).length > 0
          ? data
          : { ok: false, error: "Failed to load features" },
        { status: response.status >= 400 ? response.status : 502 }
      );
    }

    return NextResponse.json(normalizeFeatures(data));
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  }
}
