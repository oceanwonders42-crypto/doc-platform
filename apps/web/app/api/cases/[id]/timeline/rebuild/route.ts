import { proxyJsonUpstream } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/timeline/rebuild`,
    method: "POST",
    proxyName: "case_timeline_rebuild_proxy",
  });
}
