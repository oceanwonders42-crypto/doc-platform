import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EMPTY_FEATURES = {
  insurance_extraction: false,
  court_extraction: false,
  demand_narratives: false,
  duplicates_detection: false,
  crm_sync: false,
  crm_push: false,
  case_insights: false,
  email_automation: false,
};

export async function GET() {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { error: "Missing DOC_API_URL or DOC_API_KEY" },
      { status: 500 }
    );
  }
  const res = await fetch(`${base}/me/features`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) {
    return NextResponse.json(EMPTY_FEATURES, { status: 200 });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json({
    insurance_extraction: Boolean(data.insurance_extraction),
    court_extraction: Boolean(data.court_extraction),
    demand_narratives: Boolean(data.demand_narratives),
    duplicates_detection: Boolean(data.duplicates_detection),
    crm_sync: Boolean(data.crm_sync),
    crm_push: Boolean(data.crm_push),
    case_insights: Boolean(data.case_insights),
    email_automation: Boolean(data.email_automation),
  });
}
