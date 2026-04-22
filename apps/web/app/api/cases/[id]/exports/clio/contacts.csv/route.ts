import { proxyUpstreamResponse } from "@/lib/upstreamJsonProxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyUpstreamResponse({
    request,
    path: `/cases/${encodeURIComponent(id)}/exports/clio/contacts.csv`,
    proxyName: "case_clio_contacts_export_proxy",
    accept: "text/csv,application/json;q=0.9,*/*;q=0.8",
    forwardHeaders: ["idempotency-key", "x-clio-reexport", "x-clio-reexport-reason"],
  });
}
