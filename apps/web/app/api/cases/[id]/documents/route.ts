import { proxyJsonUpstream, readJsonRequestBody } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/documents`,
    query: searchParams,
    proxyName: "case_documents_proxy",
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/documents/attach`,
    method: "POST",
    jsonBody: await readJsonRequestBody(request),
    proxyName: "case_documents_attach_proxy",
  });
}
