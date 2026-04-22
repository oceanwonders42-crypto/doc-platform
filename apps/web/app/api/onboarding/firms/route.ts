import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "../_lib/requirePlatformAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${auth.base}/firms`, {
    method: "POST",
    headers: {
      Authorization: auth.authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
