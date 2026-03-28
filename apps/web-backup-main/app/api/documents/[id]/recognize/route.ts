import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_URL is not set" },
      { status: 500 }
    );
  }
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_KEY is not set" },
      { status: 500 }
    );
  }

  const url = `${base}/documents/${id}/recognize`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Backend fetch failed: ${String(err)}` },
      { status: 502 }
    );
  }

  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
