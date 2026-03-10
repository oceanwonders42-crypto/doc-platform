import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getConfig() {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return null;
  return { base, key };
}

/** Test CRM webhook from settings page (no case required). */
export async function POST() {
  const config = getConfig();
  if (!config) {
    return NextResponse.json({ error: "Missing DOC_API_URL or DOC_API_KEY" }, { status: 500 });
  }
  const res = await fetch(`${config.base}/me/crm-push-test`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Upstream failed" }, { status: 502 });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}
