import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT!;
const accessKeyId = process.env.S3_ACCESS_KEY!;
const secretAccessKey = process.env.S3_SECRET_KEY!;
const region = process.env.S3_REGION || "us-east-1";
export const bucket = process.env.S3_BUCKET!;

/**
 * Tenant isolation: All object keys MUST be tenant-prefixed by firmId.
 * Use patterns like: `${firmId}/...` or `firms/${firmId}/cases/${caseId}/documents/${docId}`.
 * Never use global bucket paths (no firmId) so Firm A cannot access Firm B's objects by key.
 */

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error("Missing S3 env vars. Check apps/api/.env");
}

export const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true, // required for MinIO
  credentials: { accessKeyId, secretAccessKey },
});

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const out = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if (!out.Body) throw new Error("S3 GetObject returned empty body");
  return streamToBuffer(out.Body as any);
}

/** Presigned GET URL for the object (e.g. for Clio to fetch file). Expires in 1 hour. */
export async function getPresignedGetUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/** Delete object from storage. Does not throw if object does not exist. */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/** Check if an object exists (for collision detection). Returns false on 404. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (e: unknown) {
    const code = (e as { name?: string }).name;
    if (code === "NotFound" || (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}
