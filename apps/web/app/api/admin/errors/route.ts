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
    const limit = searchParams.get("limit") ?? "100";
    const service = searchParams.get("service");
    const qs = new URLSearchParams({ limit });
    if (service?.trim()) qs.set("service", service.trim());
    const res = await fetch(`${base}/admin/errors?${qs}`, {
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
