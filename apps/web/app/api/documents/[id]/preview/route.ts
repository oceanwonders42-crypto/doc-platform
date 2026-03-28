import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_URL is not set in apps/web/.env.local" },
      { status: 500 }
    );
  }
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_KEY is not set in apps/web/.env.local" },
      { status: 500 }
    );
  }

  const url = `${base}/documents/${id}/preview`;
  let resUpstream: Response;
  try {
    resUpstream = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Backend fetch failed: ${String(err)} | url=${url}` },
      { status: 502 }
    );
  }

  const contentType = resUpstream.headers.get("content-type") ?? "image/png";
  const cacheControl = resUpstream.headers.get("cache-control") ?? "public, max-age=3600";
  const buf = await resUpstream.arrayBuffer();

  return new NextResponse(buf, {
    status: resUpstream.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}

