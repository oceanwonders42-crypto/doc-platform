import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function looksLikeHtml(text: string, contentType: string) {
  const trimmed = text.trim().toLowerCase();
  return contentType.toLowerCase().includes("text/html") || trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

export async function GET(req: Request) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  const authHeader = req.headers.get("authorization")?.trim() ?? "";
  if (!base || (!authHeader && !key)) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        code: "DOCUMENTS_PROXY_NOT_CONFIGURED",
        error: "Missing DOC_API_URL or request authorization for the documents proxy.",
      },
      { status: 500 }
    );
  }
  const { searchParams } = new URL(req.url);
  const url = new URL("/me/documents", base);
  for (const [name, value] of searchParams.entries()) {
    url.searchParams.append(name, value);
  }
  const res = await fetch(String(url), {
    headers: {
      Accept: "application/json",
      Authorization: authHeader || `Bearer ${key}`,
    },
    cache: "no-store",
  }).catch(() => null);
  if (!res) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        code: "DOCUMENTS_UPSTREAM_UNREACHABLE",
        error: "The documents API could not be reached from the web proxy.",
      },
      { status: 502 }
    );
  }
  const body = await res.text();
  const contentType = res.headers.get("Content-Type") || "application/json";

  if (looksLikeHtml(body, contentType)) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        code: "DOCUMENTS_UPSTREAM_HTML",
        error: "The documents API returned HTML instead of JSON.",
        upstreamStatus: res.status,
      },
      { status: 502 }
    );
  }

  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        code: "DOCUMENTS_UPSTREAM_INVALID_JSON",
        error: "The documents API returned invalid JSON.",
        upstreamStatus: res.status,
      },
      { status: 502 }
    );
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    (Array.isArray((parsed as { items?: unknown[] }).items)
      || Array.isArray((parsed as { documents?: unknown[] }).documents))
  ) {
    const items = Array.isArray((parsed as { items?: unknown[] }).items)
      ? ((parsed as { items: unknown[] }).items)
      : ((parsed as { documents: unknown[] }).documents);
    const nextCursor =
      typeof (parsed as { nextCursor?: unknown }).nextCursor === "string"
      || (parsed as { nextCursor?: unknown }).nextCursor === null
        ? (parsed as { nextCursor?: string | null }).nextCursor ?? null
        : null;
    return NextResponse.json(
      {
        ...(parsed as Record<string, unknown>),
        ok: true,
        success: true,
        items,
        documents: items,
        nextCursor,
      },
      { status: res.status }
    );
  }

  return NextResponse.json(
    {
      ...(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}),
      ok: false,
      success: false,
      code:
        typeof (parsed as { code?: unknown } | null)?.code === "string"
          ? (parsed as { code: string }).code
          : res.status === 401 || res.status === 403
            ? "UNAUTHORIZED"
            : "DOCUMENTS_UPSTREAM_ERROR",
      error:
        typeof (parsed as { error?: unknown } | null)?.error === "string"
          ? (parsed as { error: string }).error
          : "The documents API request failed.",
    },
    { status: res.status }
  );
}
