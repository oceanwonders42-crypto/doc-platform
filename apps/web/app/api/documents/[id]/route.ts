import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getConfig(request: Request) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  if (!base || (!authHeader && !key)) return null;
  return { base, authHeader: authHeader || `Bearer ${key}` };
}

function looksLikeHtml(text: string, contentType: string) {
  const trimmed = text.trim().toLowerCase();
  return contentType.toLowerCase().includes("text/html") || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

async function parseUpstreamJson(res: Response) {
  const body = await res.text();
  const contentType = res.headers.get("Content-Type") || "application/json";
  if (looksLikeHtml(body, contentType)) {
    return {
      ok: false,
      code: "DOCUMENT_DETAIL_UPSTREAM_HTML",
      error: "The documents API returned HTML instead of JSON.",
      upstreamStatus: res.status,
    };
  }
  return body ? JSON.parse(body) : {};
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const config = getConfig(req);
  if (!config) {
    return NextResponse.json(
      { ok: false, error: "Missing DOC_API_URL or request authorization for the document detail proxy." },
      { status: 500 }
    );
  }
  const { id } = await params;
  const res = await fetch(`${config.base}/documents/${id}`, {
    headers: {
      Authorization: config.authHeader,
      Accept: "application/json",
    },
    cache: "no-store",
  }).catch(() => null);
  if (!res) {
    return NextResponse.json({ ok: false, error: "Upstream failed" }, { status: 502 });
  }
  const data = await parseUpstreamJson(res).catch(() => ({ ok: false, error: "Upstream returned invalid JSON" }));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const config = getConfig(req);
  if (!config) {
    return NextResponse.json(
      { ok: false, error: "Missing DOC_API_URL or request authorization for the document detail proxy." },
      { status: 500 }
    );
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${config.base}/documents/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: config.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) {
    return NextResponse.json({ ok: false, error: "Upstream failed" }, { status: 502 });
  }
  const data = await parseUpstreamJson(res).catch(() => ({ ok: false, error: "Upstream returned invalid JSON" }));
  return NextResponse.json(data, { status: res.status });
}
