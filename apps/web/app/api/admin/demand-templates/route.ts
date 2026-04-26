import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const base = () => process.env.DOC_API_URL;
const key = () => process.env.PLATFORM_ADMIN_API_KEY;

export async function GET(req: NextRequest) {
  if (!base() || !key()) {
    return NextResponse.json({ ok: false, error: "DOC_API_URL or PLATFORM_ADMIN_API_KEY not set" }, { status: 500 });
  }
  const search = req.nextUrl.searchParams.toString();
  const url = `${base()}/admin/demand-templates${search ? `?${search}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key()}` },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}

export async function POST(req: NextRequest) {
  if (!base() || !key()) {
    return NextResponse.json({ ok: false, error: "DOC_API_URL or PLATFORM_ADMIN_API_KEY not set" }, { status: 500 });
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base()}/admin/demand-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
