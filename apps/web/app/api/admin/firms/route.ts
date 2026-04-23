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

async function requireAuthorizedBearer(req: NextRequest): Promise<
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

  return { ok: true, baseUrl, authHeader };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthorizedBearer(req);
  if (!auth.ok) return auth.response;

  try {
    const res = await fetch(`${auth.baseUrl}/admin/firms`, {
      headers: {
        Authorization: auth.authHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
