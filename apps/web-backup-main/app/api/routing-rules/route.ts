import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function proxyGet() {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { error: "Missing DOC_API_URL or DOC_API_KEY" },
      { status: 500 }
    );
  }
  const res = await fetch(`${base}/me/routing-rules`, {
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

async function proxyPatch(req: Request) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { error: "Missing DOC_API_URL or DOC_API_KEY" },
      { status: 500 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base}/me/routing-rules`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) {
    return NextResponse.json({ error: "Upstream failed" }, { status: 502 });
  }
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
  });
}

export async function GET() {
  return proxyGet();
}

export async function PATCH(req: Request) {
  return proxyPatch(req);
}
