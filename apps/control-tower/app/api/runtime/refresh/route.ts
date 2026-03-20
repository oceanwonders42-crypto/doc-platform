import { NextResponse } from "next/server";

import { refreshProjectRuntime } from "@/lib/runtime-refresh";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
  };

  if (!body.projectId) {
    return NextResponse.json(
      {
        ok: false,
        status: "unknown",
        message: "projectId is required.",
      },
      { status: 400 },
    );
  }

  const result = await refreshProjectRuntime(body.projectId);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
  });
}
