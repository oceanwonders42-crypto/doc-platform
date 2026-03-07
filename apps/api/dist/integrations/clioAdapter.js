"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushDocumentToClio = pushDocumentToClio;
/**
 * Clio Manage adapter: push document metadata and file to a Clio matter when routing.
 * Uses OAuth token from firm config (clioConfig). Optional and feature-flagged (crm_sync).
 * Logs each push to CrmPushLog. Retries on 429/5xx up to 2 times with backoff.
 */
const prisma_1 = require("../db/prisma");
const clioConfig_1 = require("../services/clioConfig");
const CLIO_API_BASE = process.env.CLIO_API_BASE_URL || "https://app.clio.com/api/v4";
const CLIO_RETRY_ATTEMPTS = 2;
const CLIO_RETRY_DELAYS_MS = [1000, 2000];
async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function createDocumentWithRetry(headers, clioMatterId, fileName, documentId) {
    let lastStatus = 0;
    for (let attempt = 0; attempt <= CLIO_RETRY_ATTEMPTS; attempt++) {
        const createRes = await fetch(`${CLIO_API_BASE}/documents`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                name: fileName || documentId,
                parent: { id: clioMatterId, type: "Matter" },
            }),
        });
        lastStatus = createRes.status;
        if (createRes.ok) {
            const createData = (await createRes.json());
            const docId = createData?.data?.id;
            const version = createData?.data?.latest_document_version;
            const putUrl = version?.put_url;
            const putHeaders = version?.put_headers ?? {};
            if (!putUrl || !docId)
                throw new Error("Clio did not return put_url or document id");
            return { docId, putUrl, putHeaders };
        }
        const errText = await createRes.text();
        const retryable = createRes.status === 429 || createRes.status >= 500;
        if (retryable && attempt < CLIO_RETRY_ATTEMPTS) {
            await sleep(CLIO_RETRY_DELAYS_MS[attempt]);
            continue;
        }
        throw new Error(`Clio create document failed: ${createRes.status} ${errText.slice(0, 300)}`);
    }
    throw new Error(`Clio create document failed: HTTP ${lastStatus}`);
}
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
    const tokenResult = await (0, clioConfig_1.getClioAccessToken)(firmId);
    if (!tokenResult.configured) {
        await logClioPush(firmId, caseId, documentId, false, null, tokenResult.error ?? "Clio not configured");
        return { ok: false, error: tokenResult.error ?? "Clio OAuth token not configured" };
    }
    const accessToken = tokenResult.accessToken;
    const mapping = await prisma_1.prisma.crmCaseMapping.findUnique({
        where: { firmId_caseId: { firmId, caseId } },
        select: { externalMatterId: true },
    });
    const clioMatterId = mapping?.externalMatterId?.trim();
    if (!clioMatterId) {
        await logClioPush(firmId, caseId, documentId, false, null, "No Clio matter mapping for this case. Import mappings in Settings > CRM.");
        return { ok: false, error: "No Clio matter mapping for this case. Import mappings in Settings > CRM." };
    }
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
    };
    let docId = null;
    try {
        // 1) Create document in Clio (with retry on 429/5xx)
        const { docId: createdId, putUrl, putHeaders } = await createDocumentWithRetry(headers, clioMatterId, fileName || documentId, documentId);
        docId = createdId;
        // 2) Fetch file and upload to Clio's presigned URL
        const fileRes = await fetch(fileUrl);
        if (!fileRes.ok) {
            const err = `Failed to fetch file: ${fileRes.status}`;
            await logClioPush(firmId, caseId, documentId, false, null, err);
            return { ok: false, error: err };
        }
        const fileBuffer = await fileRes.arrayBuffer();
        const uploadHeaders = { ...putHeaders };
        if (fileRes.headers.get("content-type")) {
            uploadHeaders["Content-Type"] = fileRes.headers.get("content-type");
        }
        let putAttempt = 0;
        let putRes;
        for (;;) {
            putRes = await fetch(putUrl, {
                method: "PUT",
                headers: uploadHeaders,
                body: fileBuffer,
            });
            if (putRes.ok)
                break;
            if ((putRes.status === 429 || putRes.status >= 500) && putAttempt < CLIO_RETRY_ATTEMPTS) {
                await sleep(CLIO_RETRY_DELAYS_MS[putAttempt]);
                putAttempt++;
                continue;
            }
            const errText = await putRes.text();
            const err = `Clio upload failed: ${putRes.status} ${errText.slice(0, 300)}`;
            await logClioPush(firmId, caseId, documentId, false, null, err);
            return { ok: false, error: err };
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
        await logClioPush(firmId, caseId, documentId, true, docId, null);
        return { ok: true, clioDocumentId: docId };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await logClioPush(firmId, caseId, documentId, false, docId, message).catch(() => { });
        return { ok: false, error: message };
    }
}
async function logClioPush(firmId, caseId, documentId, ok, externalId, error) {
    await prisma_1.prisma.crmPushLog.create({
        data: {
            firmId,
            caseId,
            documentId,
            actionType: "document_push",
            provider: "clio",
            ok,
            externalId,
            error,
        },
    });
}
