import { proxyJsonUpstream } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyJsonUpstream({
    request,
    path: `/mailboxes/${encodeURIComponent(id)}/test`,
    method: "POST",
    proxyName: "mailbox_test_proxy",
  });
}
