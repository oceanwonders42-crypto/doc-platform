import { proxyJsonUpstream } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyJsonUpstream({
    request,
    path: "/mailboxes",
    proxyName: "mailboxes_proxy",
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return proxyJsonUpstream({
    request: req,
    path: "/mailboxes",
    method: "POST",
    jsonBody: body,
    proxyName: "mailboxes_proxy",
  });
}
