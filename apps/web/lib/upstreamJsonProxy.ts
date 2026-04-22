import "server-only";

import { NextResponse } from "next/server";

type ProxyJsonOptions = {
  request: Request;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  jsonBody?: unknown;
  query?: URLSearchParams;
  proxyName: string;
};

function normalizeProxyName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

function looksLikeHtml(body: string, contentType: string): boolean {
  const trimmed = body.trim().toLowerCase();
  return (
    contentType.toLowerCase().includes("text/html")
    || trimmed.startsWith("<!doctype html")
    || trimmed.startsWith("<html")
    || trimmed.startsWith("<")
  );
}

export async function proxyJsonUpstream(options: ProxyJsonOptions): Promise<NextResponse> {
  const proxyCode = normalizeProxyName(options.proxyName);
  const base = process.env.DOC_API_URL;
  if (!base) {
    return NextResponse.json(
      {
        ok: false,
        code: `${proxyCode}_NOT_CONFIGURED`,
        error: "DOC_API_URL is not set for this web proxy.",
      },
      { status: 500 }
    );
  }

  const authHeader = options.request.headers.get("authorization")?.trim() ?? "";
  if (!authHeader) {
    return NextResponse.json(
      {
        ok: false,
        code: `${proxyCode}_AUTH_REQUIRED`,
        error: "Missing Authorization header for this proxy request.",
      },
      { status: 401 }
    );
  }

  const url = new URL(options.path, base);
  if (options.query) {
    for (const [key, value] of options.query.entries()) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  try {
    response = await fetch(String(url), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: authHeader,
        ...(options.jsonBody !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.jsonBody !== undefined ? JSON.stringify(options.jsonBody) : undefined,
      cache: "no-store",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: `${proxyCode}_UPSTREAM_UNREACHABLE`,
        error: `Backend fetch failed: ${String(error)}`,
        upstreamUrl: String(url),
      },
      { status: 502 }
    );
  }

  const body = await response.text();
  const contentType = response.headers.get("content-type") || "application/json";

  if (looksLikeHtml(body, contentType)) {
    return NextResponse.json(
      {
        ok: false,
        code: `${proxyCode}_UPSTREAM_HTML`,
        error: "The upstream API returned HTML instead of JSON.",
        upstreamStatus: response.status,
        upstreamUrl: String(url),
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
        code: `${proxyCode}_UPSTREAM_INVALID_JSON`,
        error: "The upstream API returned invalid JSON.",
        upstreamStatus: response.status,
        upstreamUrl: String(url),
      },
      { status: 502 }
    );
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return NextResponse.json(parsed as Record<string, unknown>, { status: response.status });
  }

  return NextResponse.json(
    {
      ok: response.ok,
      value: parsed,
    },
    { status: response.status }
  );
}
