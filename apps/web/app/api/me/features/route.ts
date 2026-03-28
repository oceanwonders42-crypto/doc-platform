import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
    return NextResponse.json(
      { insurance_extraction: false, court_extraction: false, demand_narratives: false, duplicates_detection: false },
      { status: 200 }
    );
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json({
    insurance_extraction: Boolean(data.insurance_extraction),
    court_extraction: Boolean(data.court_extraction),
    demand_narratives: Boolean(data.demand_narratives),
    duplicates_detection: Boolean(data.duplicates_detection),
  });
}
