import { Request, Response, Router } from "express";
import { Role } from "@prisma/client";

import { requireFirmIdFromRequest } from "../../lib/tenant";
import { auth } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";
import {
  beginGmailOAuthConnect,
  completeGmailOAuthCallback,
  getGmailConnectionStatus,
  getGmailEnvStatus,
  getGmailWebReturnUrl,
  GmailOAuthError,
  renderGmailCallbackHtml,
} from "../../services/gmailOAuth";

const gmailRouter = Router();

const GMAIL_OAUTH_COOKIE = "gmail_oauth_state";

gmailRouter.get(
  "/connect",
  auth,
  requireRole(Role.FIRM_ADMIN),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;

    try {
      const envStatus = getGmailEnvStatus();
      if (!envStatus.configured) {
        return res.status(500).json({
          ok: false,
          error: "Gmail OAuth env is not fully configured.",
          missingEnvVars: envStatus.missingEnvVars,
          redirectUri: envStatus.redirectUri,
        });
      }

      const loginHint =
        typeof req.query.login_hint === "string" ? req.query.login_hint : null;
      const { authorizeUrl, cookieValue } = beginGmailOAuthConnect({
        firmId,
        userId:
          ((req as unknown as { userId?: string | null }).userId ?? null) as
            | string
            | null,
        loginHint,
      });
      res.cookie(GMAIL_OAUTH_COOKIE, cookieValue, {
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
      if (error instanceof GmailOAuthError) {
        return res
          .status(error.statusCode)
          .json({ ok: false, error: error.message });
      }
      return res.status(500).json({
        ok: false,
        error:
          (error as Error)?.message ?? "Failed to start the Gmail OAuth flow.",
      });
    }
  }
);

gmailRouter.get("/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
  const oauthError =
    typeof req.query.error === "string" ? req.query.error.trim() : "";
  const oauthErrorDescription =
    typeof req.query.error_description === "string"
      ? req.query.error_description.trim()
      : "";
  const stateCookieValue = req.cookies?.[GMAIL_OAUTH_COOKIE] as
    | string
    | undefined;

  res.clearCookie(GMAIL_OAUTH_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  if (oauthError) {
    const message = oauthErrorDescription || oauthError;
    const webReturnUrl = getGmailWebReturnUrl("error", message);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res.status(400).type("html").send(
      renderGmailCallbackHtml({
        title: "Gmail connection failed",
        message,
        actionHref: null,
        actionLabel: "Back to Onyx Intel",
      })
    );
  }

  if (!code || !state) {
    const message = "Gmail callback is missing code or state.";
    const webReturnUrl = getGmailWebReturnUrl("error", message);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res.status(400).type("html").send(
      renderGmailCallbackHtml({
        title: "Gmail connection failed",
        message,
        actionHref: null,
        actionLabel: "Back to Onyx Intel",
      })
    );
  }

  try {
    const result = await completeGmailOAuthCallback({
      code,
      stateParam: state,
      stateCookieValue,
    });
    const webReturnUrl = getGmailWebReturnUrl(
      "success",
      result.accountEmail
        ? `Connected ${result.accountEmail}.`
        : "Gmail connected."
    );
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res.status(200).type("html").send(
      renderGmailCallbackHtml({
        title: "Gmail connected",
        message: `The Gmail mailbox is connected for ${result.accountEmail}. You can close this window and return to Onyx Intel.`,
        actionHref: null,
        actionLabel: "Back to Onyx Intel",
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gmail callback failed.";
    const webReturnUrl = getGmailWebReturnUrl("error", message);
    if (webReturnUrl) {
      return res.redirect(303, webReturnUrl);
    }
    return res
      .status(error instanceof GmailOAuthError ? error.statusCode : 500)
      .type("html")
      .send(
        renderGmailCallbackHtml({
          title: "Gmail connection failed",
          message,
          actionHref: null,
          actionLabel: "Back to Onyx Intel",
        })
      );
  }
});

gmailRouter.get(
  "/status",
  auth,
  requireRole(Role.STAFF),
  async (req: Request, res: Response) => {
    const firmId = requireFirmIdFromRequest(req, res);
    if (!firmId) return;
    try {
      const status = await getGmailConnectionStatus(firmId);
      return res.json({ ok: true, ...status });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error:
          (error as Error)?.message ??
          "Failed to load Gmail connection status.",
      });
    }
  }
);

export default gmailRouter;
