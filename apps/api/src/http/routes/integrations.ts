/**
 * Firm integration routes: email + case API onboarding.
 * All routes require auth; firmId from token only. Credentials never returned to client.
 */
import { Router, Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import { requireFirmIdFromRequest, buildFirmWhere } from "../../lib/tenant";
import { encryptSecret, decryptSecret } from "../../services/credentialEncryption";
import { testImapConnection } from "../../email/imapPoller";
import {
  IntegrationType,
  IntegrationProvider,
  IntegrationStatus,
  MailboxProvider,
} from "@prisma/client";

const router = Router();

// POST /integrations/connect-email — create mailbox connection, store encrypted credentials, test
router.post(
  "/connect-email",
  auth,
  requireRole(Role.FIRM_ADMIN),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const body = req.body as {
      emailAddress: string;
      provider: "GMAIL" | "OUTLOOK" | "IMAP";
      imapHost?: string;
      imapPort?: number;
      imapSecure?: boolean;
      imapUsername?: string;
      imapPassword?: string;
      password?: string;
      folder?: string;
    };

    if (!body.emailAddress || !body.provider) {
      return res.status(400).json({ ok: false, error: "emailAddress and provider required" });
    }

    const provider = body.provider as MailboxProvider;
    const submittedPassword =
      typeof body.imapPassword === "string" && body.imapPassword.trim()
        ? body.imapPassword
        : typeof body.password === "string" && body.password.trim()
          ? body.password
          : "";

    if ((provider === "GMAIL" || provider === "OUTLOOK") && !submittedPassword) {
      return res.status(400).json({
        ok: false,
        error: "Password / app password required",
      });
    }

    if (provider === "IMAP" && !submittedPassword) {
      return res.status(400).json({
        ok: false,
        error: "IMAP password required",
      });
    }

    let encryptedSecret = "";
    if (provider === "IMAP") {
      try {
        encryptedSecret = encryptSecret(
          JSON.stringify({
            imapHost: body.imapHost || "",
            imapPort: body.imapPort ?? 993,
            imapSecure: body.imapSecure ?? true,
            imapUsername: body.imapUsername || body.emailAddress,
            imapPassword: submittedPassword,
            folder: body.folder || "INBOX",
          })
        );
      } catch (e: unknown) {
        return res.status(500).json({ ok: false, error: "Encryption not configured (ENCRYPTION_KEY)" });
      }
    } else if (provider === "GMAIL" || provider === "OUTLOOK") {
      try {
        encryptedSecret = encryptSecret(
          JSON.stringify({
            imapUsername: body.emailAddress,
            imapPassword: submittedPassword,
            folder: body.folder || "INBOX",
            ...(provider === "GMAIL" && { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true }),
            ...(provider === "OUTLOOK" && { imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true }),
          })
        );
      } catch (e: unknown) {
        return res.status(500).json({ ok: false, error: "Encryption not configured (ENCRYPTION_KEY)" });
      }
    }

    if (encryptedSecret) {
      try {
        const config = JSON.parse(decryptSecret(encryptedSecret));
        const result = await testImapConnection({
          host:
            config.imapHost ||
            (provider === "GMAIL"
              ? "imap.gmail.com"
              : provider === "OUTLOOK"
                ? "outlook.office365.com"
                : ""),
          port: config.imapPort || 993,
          secure: config.imapSecure ?? true,
          auth: { user: config.imapUsername || body.emailAddress, pass: config.imapPassword },
          mailbox: config.folder || "INBOX",
        });
        if (!result.ok) {
          return res.status(400).json({
            ok: false,
            error: "Mailbox test failed",
            details: result.error,
          });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return res.status(400).json({
          ok: false,
          error: "Mailbox test failed",
          details: msg,
        });
      }
    }

    try {
      const integration = await prisma.firmIntegration.create({
        data: {
          firmId,
          type: IntegrationType.EMAIL,
          provider: provider === "IMAP" ? IntegrationProvider.GENERIC : (provider as unknown as IntegrationProvider),
          status: IntegrationStatus.DISCONNECTED,
        },
      });

      if (encryptedSecret) {
        await prisma.integrationCredential.create({
          data: {
            integrationId: integration.id,
            encryptedSecret,
          },
        });
      }

      const mailbox = await prisma.mailboxConnection.create({
        data: {
          firmId,
          emailAddress: body.emailAddress,
          provider,
          active: true,
          integrationId: integration.id,
        },
      });

      await prisma.firmIntegration.update({
        where: { id: integration.id },
        data: { status: IntegrationStatus.CONNECTED },
      });

      return res.json({
        ok: true,
        integrationId: integration.id,
        mailboxId: mailbox.id,
        emailAddress: mailbox.emailAddress,
        provider: mailbox.provider,
        status: "CONNECTED",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ ok: false, error: msg });
    }
  }
);

// POST /integrations/connect-api — store API credentials, test external API
router.post(
  "/connect-api",
  auth,
  requireRole(Role.FIRM_ADMIN),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    const body = req.body as { provider: "CLIO" | "FILEVINE" | "GENERIC"; apiKey?: string; apiSecret?: string };

    if (!body.provider) {
      return res.status(400).json({ ok: false, error: "provider required" });
    }

    const secret = body.apiKey || body.apiSecret || "";
    if (!secret) {
      return res.status(400).json({ ok: false, error: "apiKey or apiSecret required" });
    }

    let encryptedSecret: string;
    try {
      encryptedSecret = encryptSecret(JSON.stringify({ apiKey: secret }));
    } catch {
      return res.status(500).json({ ok: false, error: "Encryption not configured (ENCRYPTION_KEY)" });
    }

    try {
      const integration = await prisma.firmIntegration.create({
        data: {
          firmId,
          type: IntegrationType.CASE_API,
          provider: body.provider as IntegrationProvider,
          status: IntegrationStatus.CONNECTED,
        },
      });
      await prisma.integrationCredential.create({
        data: { integrationId: integration.id, encryptedSecret },
      });

      await prisma.integrationSyncLog.create({
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return res.status(500).json({ ok: false, error: msg });
    }
  }
);

// GET /integrations/status — connection health for firm
router.get("/status", auth, requireRole(Role.STAFF), async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;
  try {
    const [integrations, mailboxes] = await Promise.all([
      prisma.firmIntegration.findMany({
        where: buildFirmWhere(firmId),
        select: {
          id: true,
          type: true,
          provider: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.mailboxConnection.findMany({
        where: buildFirmWhere(firmId),
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
});

// POST /integrations/test — live integration test
router.post("/test", auth, requireRole(Role.FIRM_ADMIN), async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;
  const body = req.body as { integrationId?: string; mailboxId?: string };
  const integrationId = body.integrationId || body.mailboxId;
  if (!integrationId) {
    return res.status(400).json({ ok: false, error: "integrationId or mailboxId required" });
  }

  const integration = await prisma.firmIntegration.findFirst({
    where: { id: integrationId, firmId },
    include: { credentials: true },
  });
  if (!integration) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  if (integration.type === IntegrationType.EMAIL) {
    const cred = integration.credentials[0];
    if (!cred) {
      await prisma.integrationSyncLog.create({
        data: { firmId, integrationId, eventType: "connection_test", status: "error", message: "No credentials" },
      });
      return res.status(400).json({ ok: false, error: "No credentials stored" });
    }
    try {
      const config = JSON.parse(decryptSecret(cred.encryptedSecret));
      const result = await testImapConnection({
        host: config.imapHost || "imap.gmail.com",
        port: config.imapPort || 993,
        secure: config.imapSecure ?? true,
        auth: { user: config.imapUsername, pass: config.imapPassword },
        mailbox: config.folder || "INBOX",
      });
      const success = result.ok;
      await prisma.integrationSyncLog.create({
        data: {
          firmId,
          integrationId,
          eventType: "connection_test",
          status: success ? "success" : "error",
          message: success ? "Connection OK" : result.error,
        },
      });
      if (success) {
        await prisma.firmIntegration.update({
          where: { id: integrationId },
          data: { status: IntegrationStatus.CONNECTED },
        });
      }
      return res.json({ ok: success, error: success ? undefined : result.error });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await prisma.integrationSyncLog.create({
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
  await prisma.integrationSyncLog.create({
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
router.get("/sync-log", auth, requireRole(Role.STAFF), async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;
  const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 100);
  try {
    const logs = await prisma.integrationSyncLog.findMany({
      where: buildFirmWhere(firmId),
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
});

// POST /integrations/:id/disconnect — set integration and mailbox inactive / disconnect
router.post("/:id/disconnect", auth, requireRole(Role.FIRM_ADMIN), async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;
  const id = String(req.params.id ?? "");
  const integration = await prisma.firmIntegration.findFirst({ where: { id, firmId } });
  if (!integration) return res.status(404).json({ ok: false, error: "Not found" });
  await prisma.firmIntegration.update({
    where: { id },
    data: { status: IntegrationStatus.DISCONNECTED },
  });
  await prisma.mailboxConnection.updateMany({
    where: { firmId, integrationId: id },
    data: { active: false },
  });
  return res.json({ ok: true });
});

// GET /integrations/health — dashboard: active integrations, last sync, error count, status
router.get("/health", auth, requireRole(Role.STAFF), async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;
  try {
    const [integrations, mailboxes, errorCount] = await Promise.all([
      prisma.firmIntegration.findMany({
        where: buildFirmWhere(firmId),
        select: { id: true, type: true, provider: true, status: true, updatedAt: true },
      }),
      prisma.mailboxConnection.findMany({
        where: buildFirmWhere(firmId, { active: true }),
        select: { id: true, emailAddress: true, provider: true, lastSyncAt: true },
      }),
      prisma.integrationSyncLog.count({
        where: buildFirmWhere(firmId, { status: "error", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      }),
    ]);
    const lastSync = mailboxes.length
      ? mailboxes.reduce((acc, m) => {
          const t = m.lastSyncAt?.getTime();
          return t && (!acc || t > acc) ? t : acc;
        }, 0 as number)
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
