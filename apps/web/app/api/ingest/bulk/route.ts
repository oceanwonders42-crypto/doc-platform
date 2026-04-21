import {
  methodNotAllowedResponse,
  proxyUploadJson,
  readUploadFormData,
  resolveApiBase,
  resolveUpstreamAuth,
} from "../shared";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const base = resolveApiBase();
  if (typeof base !== "string") return base;

  const auth = resolveUpstreamAuth(req);
  if (!auth.ok) return auth.response;

  const formResult = await readUploadFormData(req, "files", { maxFiles: 20 });
  if (!formResult.ok) return formResult.response;

  if (!formResult.formData.get("source")) {
    formResult.formData.set("source", "web");
  }

  return proxyUploadJson(`${base}/me/ingest/bulk`, {
    method: "POST",
    headers: auth.headers,
    body: formResult.formData,
  });
}

export const GET = methodNotAllowedResponse;
export const PUT = methodNotAllowedResponse;
export const PATCH = methodNotAllowedResponse;
export const DELETE = methodNotAllowedResponse;
