import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json({
      ok: false,
      error: "DOC_API_URL or DOC_API_KEY not set",
    });
  }
  try {
    const res = await fetch(`${base}/metrics/review?range=1d`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && data && data.ok === true;
    return NextResponse.json({
      ok,
      error: ok ? undefined : (data?.error || `HTTP ${res.status}`),
    });
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
