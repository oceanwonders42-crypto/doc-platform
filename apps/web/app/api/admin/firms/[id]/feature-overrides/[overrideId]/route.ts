import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getApiBase(): string | null {
  const value = process.env.DOC_API_URL?.trim();
  return value ? value : null;
}

function getBearerAuthorization(req: NextRequest): string | null {
  const value = req.headers.get("authorization")?.trim();
  if (!value || !/^Bearer\s+\S+/i.test(value)) {
    return null;
  }
  return value;
}

function isPlatformAdminAuth(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as {
    role?: unknown;
    isPlatformAdmin?: unknown;
    user?: { role?: unknown } | null;
  };
  return (
    record.isPlatformAdmin === true ||
    record.role === "PLATFORM_ADMIN" ||
    record.user?.role === "PLATFORM_ADMIN"
  );
}

async function requirePlatformAdmin(req: NextRequest): Promise<
  | { ok: true; baseUrl: string; authHeader: string }
  | { ok: false; response: NextResponse }
> {
  const baseUrl = getApiBase();
  if (!baseUrl) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "DOC_API_URL is not set" },
        { status: 500 }
      ),
    };
  }

  const authHeader = getBearerAuthorization(req);
  if (!authHeader) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  try {
    const authResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const authBody = await authResponse.json().catch(() => ({}));

    if (authResponse.status === 401) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Unauthorized" },
          { status: 401 }
        ),
      };
    }

    if (!authResponse.ok) {
      return {
        ok: false,
        response: NextResponse.json(authBody, {
          status: authResponse.status >= 400 ? authResponse.status : 502,
        }),
      };
    }

    if (!isPlatformAdminAuth(authBody)) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Forbidden" },
          { status: 403 }
        ),
      };
    }

    return { ok: true, baseUrl, authHeader };
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 502 }
      ),
    };
  }
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; overrideId: string }>;
  }
) {
  const auth = await requirePlatformAdmin(req);
  if (!auth.ok) return auth.response;

  const { id, overrideId } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const response = await fetch(
      `${auth.baseUrl}/admin/firms/${id}/feature-overrides/${overrideId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth.authHeader,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
