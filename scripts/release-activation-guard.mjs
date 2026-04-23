import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

export const requiredSchemaDriftGuardFiles = [
  path.join("scripts", "schema-drift-lib.mjs"),
  path.join("scripts", "check-schema-drift.mjs"),
  path.join("scripts", "schema-drift-lib.test.mjs"),
];

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findMissingSchemaDriftGuardFiles({
  releaseRoot,
  requiredFiles = requiredSchemaDriftGuardFiles,
} = {}) {
  const missingFiles = [];

  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(releaseRoot, relativePath);
    if (!(await fileExists(absolutePath))) {
      missingFiles.push(relativePath);
    }
  }

  return missingFiles;
}

export function formatMissingSchemaDriftGuardFilesError({
  releaseRoot,
  missingFiles,
}) {
  return `release activation blocked for ${releaseRoot}: missing required schema drift guard file(s): ${missingFiles.join(", ")}`;
}

export async function runSchemaDriftGuardScript({
  releaseRoot,
  stdio = "pipe",
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join("scripts", "check-schema-drift.mjs")], {
      cwd: releaseRoot,
      stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    if (stdio === "inherit") {
      child.on("exit", (code) => {
        resolve({
          ok: code === 0,
          exitCode: code ?? null,
          stdout: "",
          stderr: "",
        });
      });
      child.on("error", reject);
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      resolve({
        ok: code === 0,
        exitCode: code ?? null,
        stdout,
        stderr,
      });
    });
    child.on("error", reject);
  });
}

export async function enforceSchemaDriftGuardBeforeActivation({
  releaseRoot,
  requiredFiles = requiredSchemaDriftGuardFiles,
  stdio = "pipe",
} = {}) {
  const missingFiles = await findMissingSchemaDriftGuardFiles({
    releaseRoot,
    requiredFiles,
  });

  if (missingFiles.length > 0) {
    throw new Error(
      formatMissingSchemaDriftGuardFilesError({
        releaseRoot,
        missingFiles,
      })
    );
  }

  const result = await runSchemaDriftGuardScript({
    releaseRoot,
    stdio,
  });

  if (!result.ok) {
    const output = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join(" | ");
    throw new Error(
      `release activation blocked for ${releaseRoot}: node scripts/check-schema-drift.mjs failed${
        output ? ` (${output})` : ""
      }`
    );
  }

  return result;
}
