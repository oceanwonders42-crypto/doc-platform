"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushDocumentToClio = pushDocumentToClio;
/**
 * Clio Manage adapter: push document metadata and file to a Clio matter when routing.
 * Uses OAuth token from firm.settings.clioAccessToken. Optional and feature-flagged (crm_sync).
 */
const prisma_1 = require("../db/prisma");
const CLIO_API_BASE = process.env.CLIO_API_BASE_URL || "https://app.clio.com/api/v4";
/**
 * Push a document to a Clio matter: create document record, upload file to put_url, mark complete.
 * Requires firm.settings.crm === "clio" and firm.settings.clioAccessToken.
 */
async function pushDocumentToClio(params) {
    const { firmId, caseId, documentId, fileName, fileUrl } = params;
    const firm = await prisma_1.prisma.firm.findUnique({
        where: { id: firmId },
        select: { settings: true },
    });
    if (!firm?.settings || typeof firm.settings !== "object") {
        return { ok: false, error: "Firm settings not found" };
    }
    const settings = firm.settings;
    if (settings.crm !== "clio") {
        return { ok: false, error: "Firm CRM is not Clio" };
    }
    const accessToken = settings.clioAccessToken;
    if (!accessToken || typeof accessToken !== "string") {
        return { ok: false, error: "Clio OAuth token not configured" };
    }
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };
    // 1) Create document in Clio (parent = matter)
    const createRes = await fetch(`${CLIO_API_BASE}/documents`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            name: fileName || documentId,
            parent: { id: String(caseId), type: "Matter" },
        }),
    });
    if (!createRes.ok) {
        const errText = await createRes.text();
        return { ok: false, error: `Clio create document failed: ${createRes.status} ${errText}` };
    }
    const createData = (await createRes.json());
    const docId = createData?.data?.id;
    const version = createData?.data?.latest_document_version;
    const putUrl = version?.put_url;
    const putHeaders = version?.put_headers;
    if (!putUrl) {
        return { ok: false, error: "Clio did not return put_url for upload" };
    }
    // 2) Fetch file and upload to Clio's presigned URL
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
        return { ok: false, error: `Failed to fetch file: ${fileRes.status}` };
    }
    const fileBuffer = await fileRes.arrayBuffer();
    const uploadHeaders = { ...putHeaders };
    if (fileRes.headers.get("content-type")) {
        uploadHeaders["Content-Type"] = fileRes.headers.get("content-type");
    }
    const putRes = await fetch(putUrl, {
        method: "PUT",
        headers: uploadHeaders,
        body: fileBuffer,
    });
    if (!putRes.ok) {
        const errText = await putRes.text();
        return { ok: false, error: `Clio upload failed: ${putRes.status} ${errText}` };
    }
    // 3) Mark document as fully uploaded (if API requires it)
    if (docId) {
        const patchRes = await fetch(`${CLIO_API_BASE}/documents/${docId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ upload_completed: true }),
        });
        if (!patchRes.ok) {
            console.warn("[clioAdapter] PATCH upload_completed failed:", patchRes.status, await patchRes.text());
        }
    }
    return { ok: true, clioDocumentId: docId };
}
