import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  const { id } = await params;

  if (!base || !key) {
    return NextResponse.json(
      { ok: false, error: "Missing DOC_API_URL or DOC_API_KEY" },
      { status: 500 }
    );
  }

  const res = await fetch(`${base}/records-requests/${encodeURIComponent(id)}/generate-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
    },
  }).catch(() => null);

  if (!res) {
    return NextResponse.json({ ok: false, error: "Upstream failed" }, { status: 502 });
  }

  const body = await res.json().catch(() => ({}));
  return NextResponse.json(body, { status: res.status });
}
