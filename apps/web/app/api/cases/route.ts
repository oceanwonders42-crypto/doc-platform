import { proxyJsonUpstream } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return proxyJsonUpstream({
    request,
    path: "/cases",
    query: searchParams,
    proxyName: "cases_proxy",
  });
}
