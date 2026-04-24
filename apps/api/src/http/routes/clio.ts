import { Request, Response, Router } from "express";
import { Role } from "@prisma/client";

import { requireFirmIdFromRequest } from "../../lib/tenant";
import {
  beginClioOAuthConnect,
  ClioOAuthError,
  completeClioOAuthCallback,
  disconnectClioIntegration,
  getClioConnectionStatus,
  getClioEnvStatus,
  getClioWebReturnUrl,
  renderClioCallbackHtml,
} from "../../services/clioOAuth";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const clioRouter = Router();

const CLIO_OAUTH_COOKIE = "clio_oauth_state";

const handleClioConnectRoute = async (req: Request, res: Response) => {
  const firmId = requireFirmIdFromRequest(req, res);
  if (!firmId) return;

  try {
    const envStatus = getClioEnvStatus();
    if (!envStatus.configured) {
      return res.status(500).json({
        ok: false,
        error: "Clio OAuth env is not fully configured.",
        missingEnvVars: envStatus.missingEnvVars,
        redirectUri: envStatus.redirectUri,
      });
    }

    const { authorizeUrl, cookieValue } = beginClioOAuthConnect({
      firmId,
      userId:
        ((req as unknown as { userId?: string | null }).userId ?? null) as
          | string
          | null,
    });
    res.cookie(CLIO_OAUTH_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60 * 1000,
    });
    return res.json({
      ok: true,
      authorizeUrl,
      redirectUri: envStatus.redirectUri,
      stateCookieSet: true,
    });
  } catch (error) {
    if (error instanceof ClioOAuthError) {
      return res
        .status(error.statusCode)
        .json({ ok: false, error: error.message });
    }
    return res.status(500).json({
      ok: false,
      error:
        (error as Error)?.message ?? "Failed to start the Clio OAuth flow.",
    });
  }
};

clioRouter.get(
  "/connect",
  auth,
  requireRole(Role.FIRM_ADMIN),
  handleClioConnectRoute
);

clioRouter.get("/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
  const oauthError =
    typeof req.query.error === "string" ? req.query.error.trim() : "";
  const oauthErrorDescription =
    typeof req.query.error_description === "string"
      ? req.query.error_description.trim()
      : "";
  const stateCookieValue = req.cookies?.[CLIO_OAUTH_COOKIE] as
    | string
    | undefined;

  res.clearCookie(CLIO_OAUTH_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (oauthError) {
    const message = oauthErrorDescription || oauthError;
    const webReturnUrl = getClioWebReturnUrl("error", message);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res.status(400).type("html").send(
      renderClioCallbackHtml({
        title: "Clio connection failed",
        message,
        actionHref: null,
        actionLabel: "Back to Onyx Intel",
      })
    );
  }

  if (!code || !state) {
    const message = "Clio callback is missing code or state.";
    const webReturnUrl = getClioWebReturnUrl("error", message);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res.status(400).type("html").send(
      renderClioCallbackHtml({
        title: "Clio connection failed",
        message,
        actionHref: null,
        actionLabel: "Back to Onyx Intel",
      })
    );
  }

  try {
    const result = await completeClioOAuthCallback({
      code,
      stateParam: state,
      stateCookieValue,
    });
    const webReturnUrl = getClioWebReturnUrl(
      "success",
      result.accountName ? `Connected ${result.accountName}.` : "Clio connected."
    );
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res.status(200).type("html").send(
      renderClioCallbackHtml({
        title: "Clio connected",
        message:
          result.accountName != null
            ? `The Clio connection is active for ${result.accountName}. You can close this window and return to Onyx Intel.`
            : "The Clio connection is active. You can close this window and return to Onyx Intel.",
        actionHref: null,
        actionLabel: "Back to Onyx Intel",
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Clio callback failed.";
    const webReturnUrl = getClioWebReturnUrl("error", message);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res
      .status(error instanceof ClioOAuthError ? error.statusCode : 500)
      .type("html")
      .send(
        renderClioCallbackHtml({
          title: "Clio connection failed",
          message,
          actionHref: null,
          actionLabel: "Back to Onyx Intel",
        })
      );
  }
});

clioRouter.get(
  "/status",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    try {
      const status = await getClioConnectionStatus(firmId);
      return res.json({ ok: true, ...status });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error:
          (error as Error)?.message ?? "Failed to load Clio connection status.",
      });
    }
  }
);

clioRouter.post(
  "/disconnect",
  auth,
  requireRole(Role.FIRM_ADMIN),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    try {
      const result = await disconnectClioIntegration(firmId);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: (error as Error)?.message ?? "Failed to disconnect Clio.",
      });
    }
  }
);

export default clioRouter;
