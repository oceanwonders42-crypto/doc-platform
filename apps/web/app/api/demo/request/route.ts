import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getApiBase() {
  return (process.env.DOC_API_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
}

export async function POST(request: Request) {
  const base = getApiBase();
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "Demo request API is not configured." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${base}/demo/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": request.headers.get("user-agent") ?? "onyx-public-demo-form",
        "X-Forwarded-For": request.headers.get("x-forwarded-for") ?? "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("text/html") || text.trim().startsWith("<")) {
      return NextResponse.json(
        { ok: false, error: "Demo request API returned HTML instead of JSON." },
        { status: 502 }
      );
    }

    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { ok: false, error: "Demo request API returned invalid JSON." },
        { status: 502 }
      );
    }

    return NextResponse.json(json, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to reach the demo request API." },
      { status: 502 }
    );
  }
}

export function GET() {
  return NextResponse.json(
    { ok: false, error: "Method not allowed. Submit demo requests with POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405 }
  );
}
