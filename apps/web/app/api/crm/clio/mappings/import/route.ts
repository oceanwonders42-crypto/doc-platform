import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getConfig() {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) return null;
  return { base, key };
}

export async function POST(req: NextRequest) {
  const config = getConfig();
  if (!config) {
    return NextResponse.json({ error: "Missing DOC_API_URL or DOC_API_KEY" }, { status: 500 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file (field name must be 'file')" }, { status: 400 });
  }

  const body = new FormData();
  body.append("file", file);

  const res = await fetch(`${config.base}/crm/clio/mappings/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.key}` },
    body,
    cache: "no-store",
  }).catch(() => null);

  if (!res) return NextResponse.json({ error: "Upstream failed" }, { status: 502 });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
