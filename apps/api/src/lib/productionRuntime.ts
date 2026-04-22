const DEFAULT_JWT_SECRET = "onyx-intel-dev-jwt-change-in-production";
const DEFAULT_SESSION_SECRET = "onyx-intel-dev-secret-change-in-production";
const DEFAULT_PROVIDER_SESSION_SECRET = "dev-secret-change-in-prod";

function hasNonDefaultAuthSecret(): boolean {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const apiSecret = process.env.API_SECRET?.trim();

  return Boolean(
    (jwtSecret && jwtSecret !== DEFAULT_JWT_SECRET) ||
      (sessionSecret && sessionSecret !== DEFAULT_SESSION_SECRET) ||
      (apiSecret && apiSecret !== DEFAULT_SESSION_SECRET)
  );
}

function hasNonDefaultProviderSecret(): boolean {
  const providerSecret = process.env.PROVIDER_SESSION_SECRET?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();

  return Boolean(
    (providerSecret && providerSecret !== DEFAULT_PROVIDER_SESSION_SECRET) ||
      (sessionSecret && sessionSecret !== DEFAULT_SESSION_SECRET)
  );
}

export function validateProductionRuntime() {
  if (process.env.NODE_ENV !== "production") return;

  const errors: string[] = [];
  const warnings: string[] = [];

  if (process.env.DEMO_MODE === "true") {
    errors.push("DEMO_MODE must be disabled in production.");
  }

  if (!hasNonDefaultAuthSecret()) {
    errors.push("Set JWT_SECRET, SESSION_SECRET, or API_SECRET to a non-default production value.");
  }

  if (!hasNonDefaultProviderSecret()) {
    errors.push("Set PROVIDER_SESSION_SECRET or SESSION_SECRET to a non-default production value.");
  }

  if (!process.env.SMTP_HOST) {
    warnings.push("SMTP_HOST is unset; outbound records-request email will fail until SMTP is configured.");
  }

  if (!process.env.DOC_WEB_BASE_URL && !process.env.PROVIDER_INVITE_BASE_URL) {
    warnings.push("DOC_WEB_BASE_URL is unset; generated links may fall back to localhost-style defaults.");
  }

  warnings.forEach((warning) => console.warn(`[runtime] ${warning}`));

  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}
