import "server-only";

import { NextResponse } from "next/server";

type ProxyJsonOptions = {
  request: Request;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  jsonBody?: unknown;
  query?: URLSearchParams;
  proxyName: string;
  forwardHeaders?: string[];
};

type ProxyResponseOptions = {
  request: Request;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: BodyInit;
  query?: URLSearchParams;
  proxyName: string;
  accept?: string;
  contentType?: string;
  forwardHeaders?: string[];
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

function collectForwardHeaders(
  request: Request,
  forwardHeaders: string[] | undefined
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const headerName of forwardHeaders ?? []) {
    const value = request.headers.get(headerName)?.trim();
    if (value) {
      headers[headerName] = value;
    }
  }
  return headers;
}

function resolveUpstreamUrl(
  request: Request,
  path: string,
  query: URLSearchParams | undefined,
  proxyName: string
): { ok: true; authHeader: string; url: URL } | { ok: false; response: NextResponse } {
  const proxyCode = normalizeProxyName(proxyName);
  const base = process.env.DOC_API_URL;
  if (!base) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: `${proxyCode}_NOT_CONFIGURED`,
          error: "DOC_API_URL is not set for this web proxy.",
        },
        { status: 500 }
      ),
    };
  }

  const authHeader = request.headers.get("authorization")?.trim() ?? "";
  if (!authHeader) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: `${proxyCode}_AUTH_REQUIRED`,
          error: "Missing Authorization header for this proxy request.",
        },
        { status: 401 }
      ),
    };
  }

  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of query.entries()) {
      url.searchParams.append(key, value);
    }
  }

  return { ok: true, authHeader, url };
}

function buildHtmlErrorResponse(
  proxyName: string,
  response: Response,
  url: URL
): NextResponse {
  const proxyCode = normalizeProxyName(proxyName);
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

function sniffText(buffer: ArrayBuffer): string {
  const preview = new Uint8Array(buffer).subarray(0, Math.min(buffer.byteLength, 256));
  return new TextDecoder().decode(preview);
}

function buildPassthroughHeaders(headers: Headers): HeadersInit {
  const passthrough = new Headers();
  for (const headerName of [
    "content-type",
    "content-disposition",
    "cache-control",
    "etag",
    "last-modified",
  ]) {
    const value = headers.get(headerName);
    if (value) {
      passthrough.set(headerName, value);
    }
  }
  return passthrough;
}

export async function readJsonRequestBody(request: Request): Promise<unknown | undefined> {
  const text = await request.text().catch(() => "");
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function proxyJsonUpstream(options: ProxyJsonOptions): Promise<NextResponse> {
  const proxyCode = normalizeProxyName(options.proxyName);
  const resolved = resolveUpstreamUrl(
    options.request,
    options.path,
    options.query,
    options.proxyName
  );
  if (!resolved.ok) {
    return resolved.response;
  }

  let response: Response;
  try {
    response = await fetch(String(resolved.url), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: resolved.authHeader,
        ...collectForwardHeaders(options.request, options.forwardHeaders),
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
        upstreamUrl: String(resolved.url),
      },
      { status: 502 }
    );
  }

  const body = await response.text();
  const contentType = response.headers.get("content-type") || "application/json";

  if (looksLikeHtml(body, contentType)) {
    return buildHtmlErrorResponse(options.proxyName, response, resolved.url);
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
        upstreamUrl: String(resolved.url),
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

export async function proxyUpstreamResponse(
  options: ProxyResponseOptions
): Promise<NextResponse> {
  const proxyCode = normalizeProxyName(options.proxyName);
  const resolved = resolveUpstreamUrl(
    options.request,
    options.path,
    options.query,
    options.proxyName
  );
  if (!resolved.ok) {
    return resolved.response;
  }

  let response: Response;
  try {
    response = await fetch(String(resolved.url), {
      method: options.method ?? "GET",
      headers: {
        Accept: options.accept ?? "*/*",
        Authorization: resolved.authHeader,
        ...collectForwardHeaders(options.request, options.forwardHeaders),
        ...(options.contentType ? { "Content-Type": options.contentType } : {}),
      },
      body: options.body,
      cache: "no-store",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: `${proxyCode}_UPSTREAM_UNREACHABLE`,
        error: `Backend fetch failed: ${String(error)}`,
        upstreamUrl: String(resolved.url),
      },
      { status: 502 }
    );
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (looksLikeHtml(sniffText(buffer), contentType)) {
    return buildHtmlErrorResponse(options.proxyName, response, resolved.url);
  }

  return new NextResponse(buffer, {
    status: response.status,
    headers: buildPassthroughHeaders(response.headers),
  });
}
