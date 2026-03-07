"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Firm integration routes: email + case API onboarding.
 * All routes require auth; firmId from token only. Credentials never returned to client.
 */
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = require("../../db/prisma");
const auth_1 = require("../middleware/auth");
const requireRole_1 = require("../middleware/requireRole");
const tenant_1 = require("../../lib/tenant");
const credentialEncryption_1 = require("../../services/credentialEncryption");
const imapPoller_1 = require("../../email/imapPoller");
const client_2 = require("@prisma/client");
const router = (0, express_1.Router)();
// POST /integrations/connect-email — create mailbox connection, store encrypted credentials, test
router.post("/connect-email", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const body = req.body;
    if (!body.emailAddress || !body.provider) {
        return res.status(400).json({ ok: false, error: "emailAddress and provider required" });
    }
    const provider = body.provider;
    let encryptedSecret = "";
    if (provider === "IMAP" && (body.imapPassword != null || body.imapUsername != null)) {
        try {
            encryptedSecret = (0, credentialEncryption_1.encryptSecret)(JSON.stringify({
                imapHost: body.imapHost || "",
                imapPort: body.imapPort ?? 993,
                imapSecure: body.imapSecure ?? true,
                imapUsername: body.imapUsername || body.emailAddress,
                imapPassword: body.imapPassword || "",
                folder: body.folder || "INBOX",
            }));
        }
        catch (e) {
            return res.status(500).json({ ok: false, error: "Encryption not configured (ENCRYPTION_KEY)" });
        }
    }
    else if ((provider === "GMAIL" || provider === "OUTLOOK") && body.imapPassword != null) {
        try {
            encryptedSecret = (0, credentialEncryption_1.encryptSecret)(JSON.stringify({
                imapUsername: body.emailAddress,
                imapPassword: body.imapPassword,
                folder: body.folder || "INBOX",
                ...(provider === "GMAIL" && { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true }),
                ...(provider === "OUTLOOK" && { imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true }),
            }));
        }
        catch (e) {
            return res.status(500).json({ ok: false, error: "Encryption not configured (ENCRYPTION_KEY)" });
        }
    }
    try {
        const integration = await prisma_1.prisma.firmIntegration.create({
            data: {
                firmId,
                type: client_2.IntegrationType.EMAIL,
                provider: provider === "IMAP" ? client_2.IntegrationProvider.GENERIC : provider,
                status: client_2.IntegrationStatus.DISCONNECTED,
            },
        });
        if (encryptedSecret) {
            await prisma_1.prisma.integrationCredential.create({
                data: {
                    integrationId: integration.id,
                    encryptedSecret,
                },
            });
        }
        const mailbox = await prisma_1.prisma.mailboxConnection.create({
            data: {
                firmId,
                emailAddress: body.emailAddress,
                provider,
                active: true,
                integrationId: integration.id,
            },
        });
        // Test connection for IMAP
        if (provider === "IMAP" && encryptedSecret) {
            try {
                const config = JSON.parse((0, credentialEncryption_1.decryptSecret)(encryptedSecret));
                const result = await (0, imapPoller_1.testImapConnection)({
                    host: config.imapHost,
                    port: config.imapPort || 993,
                    secure: config.imapSecure ?? true,
                    auth: { user: config.imapUsername, pass: config.imapPassword },
                    mailbox: config.folder || "INBOX",
                });
                if (!result.ok) {
                    await prisma_1.prisma.firmIntegration.update({
                        where: { id: integration.id },
                        data: { status: client_2.IntegrationStatus.ERROR },
                    });
                    await prisma_1.prisma.integrationSyncLog.create({
                        data: {
                            firmId,
                            integrationId: integration.id,
                            eventType: "connection_test",
                            status: "error",
                            message: result.error ?? "Connection failed",
                        },
                    });
                    return res.status(400).json({
                        ok: false,
                        error: "Mailbox test failed",
                        details: result.error,
                        integrationId: integration.id,
                        mailboxId: mailbox.id,
                    });
                }
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                await prisma_1.prisma.integrationSyncLog.create({
                    data: {
                        firmId,
                        integrationId: integration.id,
                        eventType: "connection_test",
                        status: "error",
                        message: msg,
                    },
                });
                return res.status(400).json({
                    ok: false,
                    error: "Mailbox test failed",
                    details: msg,
                });
            }
        }
        await prisma_1.prisma.firmIntegration.update({
            where: { id: integration.id },
            data: { status: client_2.IntegrationStatus.CONNECTED },
        });
        return res.json({
            ok: true,
            integrationId: integration.id,
            mailboxId: mailbox.id,
            emailAddress: mailbox.emailAddress,
            provider: mailbox.provider,
            status: "CONNECTED",
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ ok: false, error: msg });
    }
});
// POST /integrations/connect-api — store API credentials, test external API
router.post("/connect-api", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const body = req.body;
    if (!body.provider) {
        return res.status(400).json({ ok: false, error: "provider required" });
    }
    const secret = body.apiKey || body.apiSecret || "";
    if (!secret) {
        return res.status(400).json({ ok: false, error: "apiKey or apiSecret required" });
    }
    let encryptedSecret;
    try {
        encryptedSecret = (0, credentialEncryption_1.encryptSecret)(JSON.stringify({ apiKey: secret }));
    }
    catch {
        return res.status(500).json({ ok: false, error: "Encryption not configured (ENCRYPTION_KEY)" });
    }
    try {
        const integration = await prisma_1.prisma.firmIntegration.create({
            data: {
                firmId,
                type: client_2.IntegrationType.CASE_API,
                provider: body.provider,
                status: client_2.IntegrationStatus.CONNECTED,
            },
        });
        await prisma_1.prisma.integrationCredential.create({
            data: { integrationId: integration.id, encryptedSecret },
        });
        await prisma_1.prisma.integrationSyncLog.create({
            data: {
                firmId,
                integrationId: integration.id,
                eventType: "connection_test",
                status: "success",
                message: "API credentials stored",
            },
        });
        return res.json({
            ok: true,
            integrationId: integration.id,
            provider: integration.provider,
            status: integration.status,
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ ok: false, error: msg });
    }
});
// GET /integrations/status — connection health for firm
router.get("/status", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    try {
        const [integrations, mailboxes] = await Promise.all([
            prisma_1.prisma.firmIntegration.findMany({
                where: (0, tenant_1.buildFirmWhere)(firmId),
                select: {
                    id: true,
                    type: true,
                    provider: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma_1.prisma.mailboxConnection.findMany({
                where: (0, tenant_1.buildFirmWhere)(firmId),
                select: { id: true, emailAddress: true, provider: true, lastSyncAt: true, active: true },
            }),
        ]);
        return res.json({
            ok: true,
            integrations: integrations.map((i) => ({
                id: i.id,
                type: i.type,
                provider: i.provider,
                status: i.status,
                createdAt: i.createdAt.toISOString(),
                updatedAt: i.updatedAt.toISOString(),
            })),
            mailboxes: mailboxes.map((m) => ({
                id: m.id,
                emailAddress: m.emailAddress,
                provider: m.provider,
                lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
                active: m.active,
            })),
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ ok: false, error: msg });
    }
});
// POST /integrations/test — live integration test
router.post("/test", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const body = req.body;
    const integrationId = body.integrationId || body.mailboxId;
    if (!integrationId) {
        return res.status(400).json({ ok: false, error: "integrationId or mailboxId required" });
    }
    const integration = await prisma_1.prisma.firmIntegration.findFirst({
        where: { id: integrationId, firmId },
        include: { credentials: true },
    });
    if (!integration) {
        return res.status(404).json({ ok: false, error: "Not found" });
    }
    if (integration.type === client_2.IntegrationType.EMAIL) {
        const cred = integration.credentials[0];
        if (!cred) {
            await prisma_1.prisma.integrationSyncLog.create({
                data: { firmId, integrationId, eventType: "connection_test", status: "error", message: "No credentials" },
            });
            return res.status(400).json({ ok: false, error: "No credentials stored" });
        }
        try {
            const config = JSON.parse((0, credentialEncryption_1.decryptSecret)(cred.encryptedSecret));
            const result = await (0, imapPoller_1.testImapConnection)({
                host: config.imapHost || "imap.gmail.com",
                port: config.imapPort || 993,
                secure: config.imapSecure ?? true,
                auth: { user: config.imapUsername, pass: config.imapPassword },
                mailbox: config.folder || "INBOX",
            });
            const success = result.ok;
            await prisma_1.prisma.integrationSyncLog.create({
                data: {
                    firmId,
                    integrationId,
                    eventType: "connection_test",
                    status: success ? "success" : "error",
                    message: success ? "Connection OK" : result.error,
                },
            });
            if (success) {
                await prisma_1.prisma.firmIntegration.update({
                    where: { id: integrationId },
                    data: { status: client_2.IntegrationStatus.CONNECTED },
                });
            }
            return res.json({ ok: success, error: success ? undefined : result.error });
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await prisma_1.prisma.integrationSyncLog.create({
                data: {
                    firmId,
                    integrationId,
                    eventType: "connection_test",
                    status: "error",
                    message: msg,
                },
            });
            return res.status(400).json({ ok: false, error: msg });
        }
    }
    // CASE_API: consider success if we have credentials
    const hasCreds = integration.credentials.length > 0;
    await prisma_1.prisma.integrationSyncLog.create({
        data: {
            firmId,
            integrationId,
            eventType: "connection_test",
            status: hasCreds ? "success" : "error",
            message: hasCreds ? "API credentials present" : "No credentials",
        },
    });
    return res.json({ ok: hasCreds, error: hasCreds ? undefined : "No API credentials" });
});
// GET /integrations/sync-log — last sync attempts
router.get("/sync-log", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 100);
    try {
        const logs = await prisma_1.prisma.integrationSyncLog.findMany({
            where: (0, tenant_1.buildFirmWhere)(firmId),
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { id: true, integrationId: true, eventType: true, status: true, message: true, createdAt: true },
        });
        return res.json({
            ok: true,
            items: logs.map((l) => ({
                id: l.id,
                integrationId: l.integrationId,
                eventType: l.eventType,
                status: l.status,
                message: l.message,
                createdAt: l.createdAt.toISOString(),
            })),
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ ok: false, error: msg });
    }
});
// POST /integrations/:id/disconnect — set integration and mailbox inactive / disconnect
router.post("/:id/disconnect", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.FIRM_ADMIN), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    const id = String(req.params.id ?? "");
    const integration = await prisma_1.prisma.firmIntegration.findFirst({ where: { id, firmId } });
    if (!integration)
        return res.status(404).json({ ok: false, error: "Not found" });
    await prisma_1.prisma.firmIntegration.update({
        where: { id },
        data: { status: client_2.IntegrationStatus.DISCONNECTED },
    });
    await prisma_1.prisma.mailboxConnection.updateMany({
        where: { firmId, integrationId: id },
        data: { active: false },
    });
    return res.json({ ok: true });
});
// GET /integrations/health — dashboard: active integrations, last sync, error count, status
router.get("/health", auth_1.auth, (0, requireRole_1.requireRole)(client_1.Role.STAFF), async (req, res) => {
    const firmId = (0, tenant_1.requireFirmIdFromRequest)(req, res);
    if (!firmId)
        return;
    try {
        const [integrations, mailboxes, errorCount] = await Promise.all([
            prisma_1.prisma.firmIntegration.findMany({
                where: (0, tenant_1.buildFirmWhere)(firmId),
                select: { id: true, type: true, provider: true, status: true, updatedAt: true },
            }),
            prisma_1.prisma.mailboxConnection.findMany({
                where: (0, tenant_1.buildFirmWhere)(firmId, { active: true }),
                select: { id: true, emailAddress: true, provider: true, lastSyncAt: true },
            }),
            prisma_1.prisma.integrationSyncLog.count({
                where: (0, tenant_1.buildFirmWhere)(firmId, { status: "error", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
            }),
        ]);
        const lastSync = mailboxes.length
            ? mailboxes.reduce((acc, m) => {
                const t = m.lastSyncAt?.getTime();
                return t && (!acc || t > acc) ? t : acc;
            }, 0)
            : null;
        return res.json({
            ok: true,
            activeIntegrations: integrations.filter((i) => i.status === "CONNECTED").length,
            totalIntegrations: integrations.length,
            mailboxes: mailboxes.length,
            lastSyncAt: lastSync ? new Date(lastSync).toISOString() : null,
            errorCountLast24h: errorCount,
            connections: integrations.map((i) => ({
                id: i.id,
                type: i.type,
                provider: i.provider,
                status: i.status,
                updatedAt: i.updatedAt.toISOString(),
            })),
        });
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(500).json({ ok: false, error: msg });
    }
});
exports.default = router;
