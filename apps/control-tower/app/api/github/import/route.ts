import { NextResponse } from "next/server";

import { importGitHubRepo } from "@/lib/github-sync";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    githubRepoId?: string;
  };

  if (!body.githubRepoId) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        message: "githubRepoId is required.",
      },
      { status: 400 },
    );
  }

  const result = await importGitHubRepo(body.githubRepoId);

  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
  });
}
