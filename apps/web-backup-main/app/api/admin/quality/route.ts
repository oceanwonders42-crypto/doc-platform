import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = process.env.DOC_API_URL;
  const key = process.env.PLATFORM_ADMIN_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { error: "DOC_API_URL or PLATFORM_ADMIN_API_KEY not set" },
      { status: 500 }
    );
  }
  try {
    const { searchParams } = new URL(req.url);
    const qs = new URLSearchParams();
    const firmId = searchParams.get("firmId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const groupBy = searchParams.get("groupBy");
    if (firmId?.trim()) qs.set("firmId", firmId.trim());
    if (dateFrom?.trim()) qs.set("dateFrom", dateFrom.trim());
    if (dateTo?.trim()) qs.set("dateTo", dateTo.trim());
    if (groupBy?.trim()) qs.set("groupBy", groupBy.trim());
    const url = `${base}/admin/quality/analytics${qs.toString() ? `?${qs}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(body, { status: res.status });
    }
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
