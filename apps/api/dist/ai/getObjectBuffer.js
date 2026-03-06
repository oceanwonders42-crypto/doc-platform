"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObjectBuffer = getObjectBuffer;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
});
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream)
        chunks.push(chunk);
    return Buffer.concat(chunks);
}
async function getObjectBuffer(key) {
    const res = await s3.send(new client_s3_1.GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
    }));
    if (!res.Body)
        throw new Error("S3 getObject returned empty body");
    return streamToBuffer(res.Body);
}
