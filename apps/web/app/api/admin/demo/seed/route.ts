import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY?.trim() || "";
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    return NextResponse.json(
      { ok: false, error: "Demo seed disabled in production" },
      { status: 403 }
    );
  }

  if (!base) {
    return NextResponse.json(
      { ok: false, error: "Missing DOC_API_URL" },
      { status: 500 }
    );
  }
  if (isProd && !key) {
    return NextResponse.json(
      { ok: false, error: "Missing DOC_API_KEY (required in production)" },
      { status: 500 }
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;

  let body: { dryRun?: boolean } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    // ignore
  }

  try {
    const res = await fetch(`${base}/admin/demo/seed`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text().catch(() => "Failed to read response");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, error: text || "Non-JSON response" }, { status: res.ok ? 500 : res.status });
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
