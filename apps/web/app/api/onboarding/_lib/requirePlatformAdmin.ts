import { NextResponse } from "next/server";

type AuthMeResponse = {
  ok?: boolean;
  role?: string | null;
  isPlatformAdmin?: boolean;
  user?: {
    role?: string | null;
  } | null;
};

export type PlatformAdminRequestContext = {
  base: string;
  authorization: string;
};

export async function requirePlatformAdmin(
  request: Request
): Promise<PlatformAdminRequestContext | NextResponse> {
  const base = process.env.DOC_API_URL;
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "DOC_API_URL not set" },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const authResponse = await fetch(`${base}/auth/me`, {
    headers: {
      Authorization: authorization,
    },
    cache: "no-store",
  });

  if (authResponse.status === 401) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const authPayload = (await authResponse.json().catch(() => null)) as AuthMeResponse | null;
  if (!authResponse.ok || authPayload?.ok !== true) {
    return NextResponse.json(
      { ok: false, error: "Failed to verify platform admin access" },
      { status: authResponse.status >= 500 ? 502 : authResponse.status }
    );
  }

  const isPlatformAdmin =
    authPayload.isPlatformAdmin === true ||
    authPayload.role === "PLATFORM_ADMIN" ||
    authPayload.user?.role === "PLATFORM_ADMIN";

  if (!isPlatformAdmin) {
    return NextResponse.json(
      { ok: false, error: "Platform admin access required" },
      { status: 403 }
    );
  }

  return { base, authorization };
}
