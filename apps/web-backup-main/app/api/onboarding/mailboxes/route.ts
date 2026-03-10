import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const base = process.env.DOC_API_URL;
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_URL not set" },
      { status: 500 }
    );
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { apiKey, ...mailboxFields } = body;
  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json(
      { ok: false, error: "apiKey is required" },
      { status: 400 }
    );
  }
  const res = await fetch(`${base}/mailboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mailboxFields),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
