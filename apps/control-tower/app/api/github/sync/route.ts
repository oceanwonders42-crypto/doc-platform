import { NextResponse } from "next/server";

import { syncAllGitHubData, syncGitHubProject } from "@/lib/github-sync";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
  };

  const result = body.projectId ? await syncGitHubProject(body.projectId) : await syncAllGitHubData();

  return NextResponse.json(result, {
    status: result.ok ? 200 : 500,
  });
}
