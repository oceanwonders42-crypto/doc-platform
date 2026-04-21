const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_UPLOAD_MB = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));

type UploadProxyErrorCode =
  | "BAD_UPSTREAM_RESPONSE"
  | "METHOD_NOT_ALLOWED"
  | "PAYLOAD_TOO_LARGE"
  | "UNAUTHORIZED"
  | "UPSTREAM_UNREACHABLE"
  | "VALIDATION_ERROR";

type UploadFormResult =
  | { ok: true; formData: FormData; files: File[] }
  | { ok: false; response: Response };

type UpstreamAuthResult =
  | { ok: true; headers: Record<string, string>; mode: "user" | "service" }
  | { ok: false; response: Response };

export function methodNotAllowedResponse(): Response {
  return jsonUploadError(
    405,
    "Method not allowed for this upload endpoint. Use POST multipart/form-data.",
    "METHOD_NOT_ALLOWED"
  );
}

export function jsonUploadError(
  status: number,
  error: string,
  code: UploadProxyErrorCode,
  extra?: Record<string, unknown>
): Response {
  return Response.json(
    {
      ok: false,
      error,
      code,
      ...(extra ?? {}),
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export function resolveApiBase(): string | Response {
  const base = process.env.DOC_API_URL?.trim();
  if (!base) {
    return jsonUploadError(500, "Missing DOC_API_URL", "BAD_UPSTREAM_RESPONSE");
  }
  return base.replace(/\/+$/, "");
}

export function resolveUpstreamAuth(req: Request, fallbackApiKey?: string | null): UpstreamAuthResult {
  const authorization = req.headers.get("authorization")?.trim();
  if (authorization) {
    return {
      ok: true,
      headers: { Authorization: authorization },
      mode: "user",
    };
  }

  const key = fallbackApiKey?.trim();
  if (key) {
    return {
      ok: true,
      headers: { Authorization: `Bearer ${key}` },
      mode: "service",
    };
  }

  return {
    ok: false,
    response: jsonUploadError(
      401,
      "Missing upload authorization. Sign in again before retrying this upload.",
      "UNAUTHORIZED"
    ),
  };
}

export async function readUploadFormData(
  req: Request,
  fieldName: string,
  options?: {
    maxFiles?: number;
  }
): Promise<UploadFormResult> {
  const formData = await req.formData();
  const files = formData.getAll(fieldName).filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return {
      ok: false,
      response: jsonUploadError(
        400,
        `Missing file upload field '${fieldName}'.`,
        "VALIDATION_ERROR"
      ),
    };
  }

  if (options?.maxFiles != null && files.length > options.maxFiles) {
    return {
      ok: false,
      response: jsonUploadError(
        413,
        `Too many files in one upload. Max ${options.maxFiles} files per request.`,
        "PAYLOAD_TOO_LARGE"
      ),
    };
  }

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        response: jsonUploadError(
          413,
          `File too large. Max upload size is ${MAX_UPLOAD_MB}MB per file.`,
          "PAYLOAD_TOO_LARGE"
        ),
      };
    }
  }

  return { ok: true, formData, files };
}

export async function proxyUploadJson(
  url: string,
  init: RequestInit
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      ...init,
      cache: "no-store",
    });
  } catch (error) {
    return jsonUploadError(
      502,
      `Upload endpoint is unreachable: ${error instanceof Error ? error.message : String(error)}`,
      "UPSTREAM_UNREACHABLE"
    );
  }

  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await upstream.text();
  const trimmed = text.trim();
  const looksLikeHtml = trimmed.startsWith("<") || contentType.includes("text/html");

  if (looksLikeHtml) {
    return jsonUploadError(
      upstream.status || 502,
      "Upload endpoint returned HTML instead of JSON. Check API routing and the active deployed build.",
      "BAD_UPSTREAM_RESPONSE",
      {
        upstreamStatus: upstream.status,
        upstreamContentType: contentType || "unknown",
        snippet: trimmed.slice(0, 120),
      }
    );
  }

  try {
    const payload = text ? JSON.parse(text) : { ok: upstream.ok };
    return Response.json(payload, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonUploadError(
      upstream.status || 502,
      "Upload endpoint returned invalid JSON.",
      "BAD_UPSTREAM_RESPONSE",
      {
        upstreamStatus: upstream.status,
        upstreamContentType: contentType || "unknown",
      }
    );
  }
}
