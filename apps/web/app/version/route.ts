import { NextResponse } from "next/server";
import { getBuildInfo } from "../../lib/buildInfo";

export const dynamic = "force-dynamic";

function computeVersionLabel(build: ReturnType<typeof getBuildInfo>) {
  const branchLabel = build.branch?.trim() || "detached";
  return `${branchLabel}@${build.shortSha}${build.dirty === true ? "-dirty" : ""}`;
}

export async function GET() {
  const build = getBuildInfo();
  return NextResponse.json({
    ok: true,
    service: "web",
    versionLabel: computeVersionLabel(build),
    packageName: build.packageName,
    packageVersion: build.packageVersion,
    commitHash: build.sha,
    shortCommitHash: build.shortSha,
    buildTime: build.builtAt,
    buildSource: build.source,
    buildBranch: build.branch,
    buildDirty: build.dirty,
    build,
    nodeEnv: process.env.NODE_ENV ?? "development",
  });
}
