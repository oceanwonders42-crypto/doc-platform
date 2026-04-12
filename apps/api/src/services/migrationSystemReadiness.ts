/**
 * Platform-level migration + Clio readiness (no secrets exposed).
 * Used by GET /migration/system-readiness for operator visibility.
 * Env checks mirror apps/api/src/services/clioOAuth.ts (no import to avoid extra deploy deps).
 */
function getClioOAuthClientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.CLIO_OAUTH_CLIENT_ID?.trim() || process.env.CLIO_CLIENT_ID?.trim();
  const clientSecret = process.env.CLIO_OAUTH_CLIENT_SECRET?.trim() || process.env.CLIO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function getClioOAuthRedirectUri(): string | null {
  const u = process.env.CLIO_OAUTH_REDIRECT_URI?.trim();
  if (u && /^https?:\/\//i.test(u)) return u;
  return null;
}

export type MigrationSystemReadinessFlags = {
  clioOAuthConfigured: boolean;
  encryptionConfigured: boolean;
  storageConfigured: boolean;
  storageReachable: boolean;
  queueConfigured: boolean;
  workerLikelyAvailable: boolean;
  migrationReady: boolean;
};

export type MigrationSystemReadinessResult = {
  readiness: MigrationSystemReadinessFlags;
  warnings: string[];
  nextActions: string[];
};

function encryptionKeyLooksConfigured(): boolean {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  return Boolean(raw && raw.length >= 32);
}

function storageEnvConfigured(): boolean {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY?.trim();
  const secretAccessKey = process.env.S3_SECRET_KEY?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  return Boolean(endpoint && accessKeyId && secretAccessKey && bucket);
}

export async function computeMigrationSystemReadiness(): Promise<MigrationSystemReadinessResult> {
  const warnings: string[] = [];
  const nextActions: string[] = [];

  const creds = getClioOAuthClientCredentials();
  const redirectUri = getClioOAuthRedirectUri();
  const clioOAuthConfigured = Boolean(creds && redirectUri);
  if (!clioOAuthConfigured) {
    warnings.push("Clio OAuth is not fully configured (client id, secret, and https redirect URI required).");
    nextActions.push("Configure CLIO_OAUTH_CLIENT_ID, CLIO_OAUTH_CLIENT_SECRET, and CLIO_OAUTH_REDIRECT_URI on the API.");
  }

  const encryptionConfigured = encryptionKeyLooksConfigured();
  if (!encryptionConfigured) {
    warnings.push("ENCRYPTION_KEY is missing or shorter than 32 characters.");
    nextActions.push("Set ENCRYPTION_KEY on the API (required to store Clio tokens securely).");
  }

  const storageConfigured = storageEnvConfigured();
  if (!storageConfigured) {
    warnings.push("S3 / object storage environment variables are incomplete.");
    nextActions.push("Configure S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, and S3_REGION as needed.");
  }

  let storageReachable = false;
  if (storageConfigured) {
    try {
      const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
      const { s3, bucket } = await import("./storage");
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      storageReachable = true;
    } catch {
      warnings.push("Object storage did not respond successfully to HeadBucket (check credentials, bucket name, and network).");
      nextActions.push("Verify S3-compatible storage from the API host (MinIO, Spaces, etc.).");
    }
  }

  let queueConfigured = false;
  try {
    const { redis } = await import("./queue");
    const pong = await redis.ping();
    queueConfigured = pong === "PONG";
    if (!queueConfigured) {
      warnings.push("Redis PING did not return PONG.");
      nextActions.push("Check REDIS_URL and Redis server health.");
    }
  } catch {
    warnings.push("Redis could not be reached (document processing queue).");
    nextActions.push("Ensure Redis is running and REDIS_URL is set correctly for the API.");
  }

  const workerLikelyAvailable = queueConfigured;
  if (queueConfigured) {
    warnings.push(
      "Worker process is not verified by this endpoint—only Redis reachability is checked. Ensure the document worker is running (e.g. pnpm dev:worker)."
    );
  }

  const migrationReady =
    clioOAuthConfigured &&
    encryptionConfigured &&
    storageConfigured &&
    storageReachable &&
    queueConfigured;

  if (!migrationReady) {
    nextActions.push("See docs/migration-system-readiness.md for the recommended bring-up order.");
  }

  return {
    readiness: {
      clioOAuthConfigured,
      encryptionConfigured,
      storageConfigured,
      storageReachable,
      queueConfigured,
      workerLikelyAvailable,
      migrationReady,
    },
    warnings,
    nextActions: [...new Set(nextActions)],
  };
}
