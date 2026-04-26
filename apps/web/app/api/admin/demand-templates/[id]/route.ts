import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const base = () => process.env.DOC_API_URL;
const key = () => process.env.PLATFORM_ADMIN_API_KEY;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!base() || !key()) {
    return NextResponse.json({ ok: false, error: "DOC_API_URL or PLATFORM_ADMIN_API_KEY not set" }, { status: 500 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${base()}/admin/demand-templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
