import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base) {
    return NextResponse.json({ ok: false, error: "DOC_API_URL is not set in apps/web/.env.local" }, { status: 500 });
  }
  if (!key) {
    return NextResponse.json({ ok: false, error: "DOC_API_KEY is not set in apps/web/.env.local" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const claimedBy = body?.claimedBy ?? "unknown";
  const patch = {
    claimedBy,
    claimedAt: new Date().toISOString(),
  };

  const url = `${base}/documents/${id}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Backend fetch failed: ${String(err)} | url=${url}` },
      { status: 502 }
    );
  }
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}

