import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";

import {
  enforceSchemaDriftGuardBeforeActivation,
  requiredSchemaDriftGuardFiles,
} from "./release-activation-guard.mjs";

async function createReleaseFixture({
  missingFiles = [],
  checkScriptBody = "process.exit(0);\n",
} = {}) {
  const releaseRoot = await mkdtemp(path.join(os.tmpdir(), "release-activation-guard-"));

  for (const relativePath of requiredSchemaDriftGuardFiles) {
    if (missingFiles.includes(relativePath)) {
      continue;
    }

    const absolutePath = path.join(releaseRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const body =
      relativePath === path.join("scripts", "check-schema-drift.mjs")
        ? checkScriptBody
        : "export {};\n";
    await writeFile(absolutePath, body, "utf8");
  }

  return releaseRoot;
}

async function main() {
  const passingRelease = await createReleaseFixture();
  await enforceSchemaDriftGuardBeforeActivation({
    releaseRoot: passingRelease,
  });

  const missingGuardRelease = await createReleaseFixture({
    missingFiles: [path.join("scripts", "schema-drift-lib.test.mjs")],
  });
  await assert.rejects(
    () =>
      enforceSchemaDriftGuardBeforeActivation({
        releaseRoot: missingGuardRelease,
      }),
    (error) =>
      error instanceof Error &&
      error.message.includes(missingGuardRelease) &&
      error.message.includes(path.join("scripts", "schema-drift-lib.test.mjs"))
  );

  const driftFailRelease = await createReleaseFixture({
    checkScriptBody:
      "console.error('schema drift detected: mailbox_connections.last_error missing');\nprocess.exit(1);\n",
  });
  await assert.rejects(
    () =>
      enforceSchemaDriftGuardBeforeActivation({
        releaseRoot: driftFailRelease,
      }),
    (error) =>
      error instanceof Error &&
      error.message.includes(driftFailRelease) &&
      error.message.includes("node scripts/check-schema-drift.mjs failed") &&
      error.message.includes("mailbox_connections.last_error")
  );

  await Promise.all([
    rm(passingRelease, { recursive: true, force: true }),
    rm(missingGuardRelease, { recursive: true, force: true }),
    rm(driftFailRelease, { recursive: true, force: true }),
  ]);

  console.log("Release activation guard checks passed", {
    requiredFiles: requiredSchemaDriftGuardFiles,
    scenarios: ["guard present", "guard missing", "drift detected"],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
