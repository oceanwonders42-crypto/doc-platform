export const runtime = "nodejs";

export async function POST(req: Request) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;

  if (!base) return new Response("Missing DOC_API_URL", { status: 500 });
  if (!key) return new Response("Missing DOC_API_KEY", { status: 500 });

  const incoming = await req.formData();

  // Optional: default source if not provided
  if (!incoming.get("source")) incoming.set("source", "web");

  const upstream = await fetch(`${base}/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      // DO NOT set Content-Type; fetch will set multipart boundary automatically
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
