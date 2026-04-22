import { Router, type Request, type Response } from "express";
import { Role } from "@prisma/client";

import { auth } from "../middleware/auth";
import { authWithScope } from "../middleware/authScope";
import { requireRole } from "../middleware/requireRole";
import { requireFirmIdFromRequest } from "../../lib/tenant";
import {
  beginQuickbooksOAuthConnect,
  completeQuickbooksOAuthCallback,
  getQuickbooksConnectionStatus,
  getQuickbooksEnvStatus,
  getQuickbooksWebReturnUrl,
  QuickbooksAuthError,
  renderQuickbooksCallbackHtml,
} from "../../services/quickbooks";
import {
  getQuickbooksOpsSnapshot,
  handleInternalOrderSync,
  InternalOrderSyncError,
  resendQuickbooksInvoiceSync,
} from "../../services/quickbooksOrderSync";

const quickbooksIntegrationRouter = Router();
const quickbooksOpsRouter = Router();
const internalOrderSyncRouter = Router();

const QUICKBOOKS_OAUTH_COOKIE = "qbo_oauth_state";

const handleQuickbooksConnectRoute = async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;

  try {
    const { authorizeUrl, cookieValue } = beginQuickbooksOAuthConnect({
      firmId,
      userId: ((req as unknown as { userId?: string | null }).userId ?? null) as string | null,
    });
    res.cookie(QUICKBOOKS_OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });
    res.json({ ok: true, authorizeUrl });
  } catch (error) {
    if (error instanceof QuickbooksAuthError) {
      return res.status(error.statusCode).json({ ok: false, error: error.message });
    }
    return res.status(500).json({ ok: false, error: (error as Error)?.message ?? "Failed to start QuickBooks OAuth." });
  }
};

quickbooksIntegrationRouter.get(
  "/connect",
  auth,
  requireRole(Role.FIRM_ADMIN),
  handleQuickbooksConnectRoute
);

quickbooksIntegrationRouter.get(
  "/start",
  auth,
  requireRole(Role.FIRM_ADMIN),
  handleQuickbooksConnectRoute
);

quickbooksIntegrationRouter.get("/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
  const realmId = typeof req.query.realmId === "string" ? req.query.realmId.trim() : "";
  const oauthError = typeof req.query.error === "string" ? req.query.error.trim() : "";
  const oauthErrorDescription =
    typeof req.query.error_description === "string" ? req.query.error_description.trim() : "";
  const stateCookieValue = req.cookies?.[QUICKBOOKS_OAUTH_COOKIE] as string | undefined;

  res.clearCookie(QUICKBOOKS_OAUTH_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (oauthError) {
    const webReturnUrl = getQuickbooksWebReturnUrl("error", oauthErrorDescription || oauthError);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res
      .status(400)
      .type("html")
      .send(
        renderQuickbooksCallbackHtml({
          title: "QuickBooks connection failed",
          message: oauthErrorDescription || oauthError,
          actionHref: null,
          actionLabel: "Back to OnyxIntel",
        })
      );
  }

  if (!code || !state || !realmId) {
    const message = "QuickBooks callback is missing code, state, or realmId.";
    const webReturnUrl = getQuickbooksWebReturnUrl("error", message);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res
      .status(400)
      .type("html")
      .send(
        renderQuickbooksCallbackHtml({
          title: "QuickBooks connection failed",
          message,
          actionHref: null,
          actionLabel: "Back to OnyxIntel",
        })
      );
  }

  try {
    await completeQuickbooksOAuthCallback({
      stateParam: state,
      stateCookieValue,
      code,
      realmId,
    });
    const webReturnUrl = getQuickbooksWebReturnUrl("success");
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res
      .status(200)
      .type("html")
      .send(
        renderQuickbooksCallbackHtml({
          title: "QuickBooks connected",
          message: "The QuickBooks connection is active. You can close this window and return to OnyxIntel.",
          actionHref: null,
          actionLabel: "Back to OnyxIntel",
        })
      );
  } catch (error) {
    const message = error instanceof Error ? error.message : "QuickBooks callback failed.";
    const webReturnUrl = getQuickbooksWebReturnUrl("error", message);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res
      .status(error instanceof QuickbooksAuthError ? error.statusCode : 500)
      .type("html")
      .send(
        renderQuickbooksCallbackHtml({
          title: "QuickBooks connection failed",
          message,
          actionHref: null,
          actionLabel: "Back to OnyxIntel",
        })
      );
  }
});

quickbooksOpsRouter.get("/connection", auth, requireRole(Role.FIRM_ADMIN), async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;

  try {
    const [connection, envStatus] = await Promise.all([
      getQuickbooksConnectionStatus(firmId),
      Promise.resolve(getQuickbooksEnvStatus()),
    ]);
    return res.json({ ok: true, connection, envStatus });
  } catch (error) {
    return res.status(500).json({ ok: false, error: (error as Error)?.message ?? "Failed to load QuickBooks connection." });
  }
});

quickbooksOpsRouter.get("/invoice-syncs", auth, requireRole(Role.FIRM_ADMIN), async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;

  try {
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? "25"), 10) || 25, 100);
    const snapshot = await getQuickbooksOpsSnapshot(firmId);
    return res.json({
      ok: true,
      connection: snapshot.connection,
      envStatus: snapshot.envStatus,
      items: snapshot.syncs.slice(0, limit),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: (error as Error)?.message ?? "Failed to load QuickBooks sync history." });
  }
});

quickbooksOpsRouter.post(
  "/invoice-syncs/:id/resend",
  auth,
  requireRole(Role.FIRM_ADMIN),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;

    try {
      const sync = await resendQuickbooksInvoiceSync({
        firmId,
        syncId: String(req.params.id ?? ""),
        requestId: ((req as unknown as { requestId?: string | null }).requestId ?? null) as string | null,
      });
      return res.json({ ok: true, sync });
    } catch (error) {
      if (error instanceof InternalOrderSyncError) {
        return res.status(error.httpStatus).json({ ok: false, error: error.message, syncId: error.syncId ?? null });
      }
      return res.status(500).json({ ok: false, error: (error as Error)?.message ?? "Failed to resend QuickBooks invoice." });
    }
  }
);

internalOrderSyncRouter.post(
  "/order-sync",
  authWithScope("order_sync"),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;

    try {
      const result = await handleInternalOrderSync({
        firmId,
        payload: req.body,
        requestId: ((req as unknown as { requestId?: string | null }).requestId ?? null) as string | null,
      });
      return res.status(result.created ? 201 : 200).json({ ok: true, created: result.created, sync: result.sync });
    } catch (error) {
      if (error instanceof InternalOrderSyncError) {
        return res.status(error.httpStatus).json({ ok: false, error: error.message, syncId: error.syncId ?? null });
      }
      return res.status(500).json({ ok: false, error: (error as Error)?.message ?? "Order sync failed." });
    }
  }
);

export { quickbooksIntegrationRouter, quickbooksOpsRouter, internalOrderSyncRouter };
