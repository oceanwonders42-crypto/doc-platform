import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.DOC_API_URL;
  if (!base) {
    return NextResponse.json({
      ok: false,
      status: 0,
      latencyMs: null,
      error: "DOC_API_URL not set",
    });
  }
  const start = Date.now();
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    const latencyMs = Date.now() - start;
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && data && (data.ok === true || data.ok === "true");
    return NextResponse.json({
      ok,
      status: res.status,
      latencyMs,
      error: ok ? undefined : (data?.error || `HTTP ${res.status}`),
    });
  } catch (e: unknown) {
    const latencyMs = Date.now() - start;
    return NextResponse.json({
      ok: false,
      status: 0,
      latencyMs,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
