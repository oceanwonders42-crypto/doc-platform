import { proxyJsonUpstream } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; providerId: string }> }
) {
  const { id, providerId } = await params;
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/providers/${encodeURIComponent(providerId)}`,
    method: "DELETE",
    proxyName: "case_provider_delete_proxy",
  });
}
