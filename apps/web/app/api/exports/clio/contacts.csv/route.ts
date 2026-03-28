import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = process.env.DOC_API_URL;
  const key = process.env.DOC_API_KEY;
  if (!base || !key) {
    return NextResponse.json(
      { error: "DOC_API_URL or DOC_API_KEY not set" },
      { status: 500 }
    );
  }
  const { searchParams } = new URL(req.url);
  const firmId = searchParams.get("firmId");
  const url = firmId ? `${base}/exports/clio/contacts.csv?firmId=${encodeURIComponent(firmId)}` : `${base}/exports/clio/contacts.csv`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(err, { status: res.status });
  }

  const csv = await res.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="clio-contacts.csv"',
    },
  });
}
