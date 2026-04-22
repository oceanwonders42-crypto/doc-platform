import { proxyJsonUpstream, readJsonRequestBody } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/providers`,
    proxyName: "case_providers_proxy",
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/providers`,
    method: "POST",
    jsonBody: await readJsonRequestBody(request),
    proxyName: "case_providers_proxy",
  });
}
