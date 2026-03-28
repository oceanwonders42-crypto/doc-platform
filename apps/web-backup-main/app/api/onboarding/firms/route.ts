import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const base = process.env.DOC_API_URL;
  const key = process.env.PLATFORM_ADMIN_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_URL or PLATFORM_ADMIN_API_KEY not set" },
      { status: 500 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base}/firms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
