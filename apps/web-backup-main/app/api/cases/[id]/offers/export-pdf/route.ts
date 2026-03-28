import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { ok: false, error: "Missing DOC_API_URL or DOC_API_KEY" },
      { status: 500 }
    );
  }

  const res = await fetch(`${base}/cases/${id}/offers/export-pdf`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }).catch(() => null);

  if (!res) {
    return NextResponse.json({ ok: false, error: "Upstream failed" }, { status: 502 });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("Content-Type") ?? "application/pdf";
  const disposition = res.headers.get("Content-Disposition");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      ...(disposition && { "Content-Disposition": disposition }),
    },
  });
}
