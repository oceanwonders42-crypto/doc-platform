"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.s3 = exports.bucket = void 0;
exports.putObject = putObject;
exports.getObjectBuffer = getObjectBuffer;
exports.getPresignedGetUrl = getPresignedGetUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;
const region = process.env.S3_REGION || "us-east-1";
exports.bucket = process.env.S3_BUCKET;
if (!endpoint || !accessKeyId || !secretAccessKey || !exports.bucket) {
    throw new Error("Missing S3 env vars. Check apps/api/.env");
}
exports.s3 = new client_s3_1.S3Client({
    region,
    endpoint,
    forcePathStyle: true, // required for MinIO
    credentials: { accessKeyId, secretAccessKey },
});
async function putObject(key, body, contentType) {
    await exports.s3.send(new client_s3_1.PutObjectCommand({
        Bucket: exports.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
    }));
}
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
}
async function getObjectBuffer(key) {
    const out = await exports.s3.send(new client_s3_1.GetObjectCommand({
        Bucket: exports.bucket,
        Key: key,
    }));
    if (!out.Body)
        throw new Error("S3 GetObject returned empty body");
    return streamToBuffer(out.Body);
}
/** Presigned GET URL for the object (e.g. for Clio to fetch file). Expires in 1 hour. */
async function getPresignedGetUrl(key, expiresInSeconds = 3600) {
    const command = new client_s3_1.GetObjectCommand({ Bucket: exports.bucket, Key: key });
    return (0, s3_request_presigner_1.getSignedUrl)(exports.s3, command, { expiresIn: expiresInSeconds });
}
