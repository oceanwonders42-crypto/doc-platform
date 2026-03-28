import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { error: "Missing DOC_API_URL or DOC_API_KEY" },
      { status: 500 }
    );
  }
  const { id } = await params;
  const res = await fetch(`${base}/me/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res) {
    return NextResponse.json({ error: "Upstream failed" }, { status: 502 });
  }
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}
