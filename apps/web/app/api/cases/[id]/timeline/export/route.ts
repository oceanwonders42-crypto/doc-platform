import { proxyUpstreamResponse } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  return proxyUpstreamResponse({
    request,
    path: `/cases/${encodeURIComponent(id)}/timeline/export`,
    query: searchParams,
    proxyName: "case_timeline_export_proxy",
    accept:
      "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/json;q=0.9,*/*;q=0.8",
  });
}
