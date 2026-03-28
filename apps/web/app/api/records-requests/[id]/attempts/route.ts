import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getConfig() {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return null;
  return { base, key };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = getConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Missing DOC_API_URL or DOC_API_KEY" }, { status: 500 });
  }

  const res = await fetch(`${config.base}/records-requests/${encodeURIComponent(id)}/attempts`, {
    headers: { Authorization: `Bearer ${config.key}` },
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
