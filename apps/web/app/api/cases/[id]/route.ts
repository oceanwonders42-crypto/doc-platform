import { proxyJsonUpstream } from "@/lib/upstreamJsonProxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}`,
    proxyName: "case_detail_proxy",
  });
}
