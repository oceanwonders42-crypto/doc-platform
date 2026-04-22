import { proxyJsonUpstream, readJsonRequestBody } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

async function proxyCaseSubpath(
  request: Request,
  params: Promise<{ id: string; path: string[] }>,
  method: "GET" | "POST" | "PATCH" | "DELETE"
) {
  const { id, path } = await params;
  const suffix = path.map((segment) => encodeURIComponent(segment)).join("/");
  const query = new URL(request.url).searchParams;
  return proxyJsonUpstream({
    request,
    path: `/cases/${encodeURIComponent(id)}/${suffix}`,
    method,
    query: method === "GET" ? query : undefined,
    jsonBody: method === "GET" ? undefined : await readJsonRequestBody(request),
    proxyName: `case_subpath_${method.toLowerCase()}_proxy`,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  return proxyCaseSubpath(request, params, "GET");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  return proxyCaseSubpath(request, params, "POST");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  return proxyCaseSubpath(request, params, "PATCH");
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  return proxyCaseSubpath(request, params, "DELETE");
}
