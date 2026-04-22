import { proxyJsonUpstream } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/offers`,
    proxyName: "case_offers_proxy",
  });
}
