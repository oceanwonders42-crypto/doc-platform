import { proxyJsonUpstream } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/timeline`,
    query: searchParams,
    proxyName: "case_timeline_proxy",
  });
}
