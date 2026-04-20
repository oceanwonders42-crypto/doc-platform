import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "../_lib/requirePlatformAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { apiKey, ...mailboxFields } = body;
  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json(
      { ok: false, error: "apiKey is required" },
      { status: 400 }
    );
  }
  const res = await fetch(`${auth.base}/mailboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mailboxFields),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({ ok: false }));
  return NextResponse.json(data, { status: res.status });
}
