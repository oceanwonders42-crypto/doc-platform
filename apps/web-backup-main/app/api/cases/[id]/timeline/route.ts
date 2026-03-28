import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_URL or DOC_API_KEY is not set" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const track = searchParams.get("track");
  const provider = searchParams.get("provider");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const qs = new URLSearchParams();
  if (track && ["medical", "legal", "insurance"].includes(track)) qs.set("track", track);
  if (provider?.trim()) qs.set("provider", provider.trim());
  if (dateFrom) qs.set("dateFrom", dateFrom);
  if (dateTo) qs.set("dateTo", dateTo);
  const q = qs.toString() ? `?${qs}` : "";
  const url = `${base}/cases/${id}/timeline${q}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
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
