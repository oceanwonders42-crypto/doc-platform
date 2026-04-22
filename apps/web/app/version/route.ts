import { NextResponse } from "next/server";
import { getBuildInfo } from "../../lib/buildInfo";

export const dynamic = "force-dynamic";

export async function GET() {
  const build = getBuildInfo();
  return NextResponse.json({
    ok: true,
    service: "web",
    versionLabel: build.versionLabel,
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
