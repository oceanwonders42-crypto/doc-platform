import { requirePlatformAdmin } from "../_lib/requirePlatformAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  const incoming = await req.formData();
  const apiKey = incoming.get("apiKey");
  const key = typeof apiKey === "string" && apiKey.trim()
    ? apiKey.trim()
    : process.env.DOC_API_KEY;

  if (!key) return new Response("Missing apiKey in formData or DOC_API_KEY", { status: 500 });

  incoming.delete("apiKey");

  if (!incoming.get("source")) incoming.set("source", "web");

  const upstream = await fetch(`${auth.base}/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
    },
    body: incoming,
    cache: "no-store",
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
