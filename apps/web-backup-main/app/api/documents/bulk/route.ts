import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getConfig() {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return null;
  return { base, key };
}

export async function PATCH(req: NextRequest) {
  const config = getConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Missing DOC_API_URL or DOC_API_KEY" },
      { status: 500 }
    );
  }
  const json = await req.json().catch(() => ({}));
  const res = await fetch(`${config.base}/documents/bulk`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(json),
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
