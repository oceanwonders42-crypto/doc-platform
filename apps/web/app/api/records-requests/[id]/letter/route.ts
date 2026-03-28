import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  const { id } = await params;

  if (!base || !key) {
    return NextResponse.json({ ok: false, error: "Missing DOC_API_URL or DOC_API_KEY" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const url = qs ? `${base}/records-requests/${id}/letter?${qs}` : `${base}/records-requests/${id}/letter`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res) {
    return NextResponse.json({ ok: false, error: "Upstream request failed" }, { status: 502 });
  }

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}

