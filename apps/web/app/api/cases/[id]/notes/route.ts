import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  const { id } = await params;

  if (!base || !key) {
    return NextResponse.json({ ok: false, error: "Missing DOC_API_URL or DOC_API_KEY" }, { status: 500 });
  }

  const url = new URL(req.url);
  const firmId = url.searchParams.get("firmId");
  const apiUrl = firmId
    ? `${base}/cases/${id}/notes?firmId=${encodeURIComponent(firmId)}`
    : `${base}/cases/${id}/notes`;

  const res = await fetch(apiUrl, {
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  const { id } = await params;

  if (!base || !key) {
    return NextResponse.json({ ok: false, error: "Missing DOC_API_URL or DOC_API_KEY" }, { status: 500 });
  }

  const json = await req.json().catch(() => ({}));

  const res = await fetch(`${base}/cases/${id}/notes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(json),
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
