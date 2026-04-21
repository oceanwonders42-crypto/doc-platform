import { NextResponse } from "next/server";
import { parseJsonResponse } from "../../../../lib/api";

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
  const upstreamUrl = `${base}/health`;
  try {
    const res = await fetch(upstreamUrl, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const latencyMs = Date.now() - start;
    let data: { ok?: boolean | string; error?: string };
    try {
      data = (await parseJsonResponse(res)) as { ok?: boolean | string; error?: string };
    } catch (error) {
      return NextResponse.json({
        ok: false,
        status: res.status,
        latencyMs,
        upstreamUrl,
        upstreamContentType: res.headers.get("content-type"),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const ok = res.ok && data && (data.ok === true || data.ok === "true");
    return NextResponse.json({
      ok,
      status: res.status,
      latencyMs,
      upstreamUrl,
      upstreamContentType: res.headers.get("content-type"),
      error: ok ? undefined : (data?.error || `HTTP ${res.status}`),
    });
  } catch (e: unknown) {
    const latencyMs = Date.now() - start;
    return NextResponse.json({
      ok: false,
      status: 0,
      latencyMs,
      upstreamUrl,
      upstreamContentType: null,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
