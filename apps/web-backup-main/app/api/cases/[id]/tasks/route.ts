import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getConfig() {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return null;
  return { base, key };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const config = getConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Missing DOC_API_URL or DOC_API_KEY" }, { status: 500 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const firmId = url.searchParams.get("firmId");
  const apiUrl = firmId
    ? `${config.base}/cases/${id}/tasks?firmId=${encodeURIComponent(firmId)}`
    : `${config.base}/cases/${id}/tasks`;
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${config.key}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ ok: false, error: "Upstream failed" }, { status: 502 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const config = getConfig();
  if (!config) {
    return NextResponse.json({ ok: false, error: "Missing DOC_API_URL or DOC_API_KEY" }, { status: 500 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${config.base}/cases/${id}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);
  if (!res) return NextResponse.json({ ok: false, error: "Upstream failed" }, { status: 502 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
