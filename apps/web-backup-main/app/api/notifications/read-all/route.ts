import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { error: "Missing DOC_API_URL or DOC_API_KEY" },
      { status: 500 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base}/me/notifications/read-all`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);
  if (!res) {
    return NextResponse.json({ error: "Upstream failed" }, { status: 502 });
  }
  const responseText = await res.text();
  return new NextResponse(responseText, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}
