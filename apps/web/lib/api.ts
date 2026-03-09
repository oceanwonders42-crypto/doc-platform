/**
 * API base URL and safe response parsing.
 * Use getApiBase() so the app can point to the backend (set NEXT_PUBLIC_API_URL in .env.local).
 * Use parseJsonResponse() to avoid "Unexpected token '<'" when the server returns HTML instead of JSON.
 */

/**
 * Base URL for API requests. When empty, fetch() goes to same origin (Next.js), which returns HTML for unknown routes.
 * Set NEXT_PUBLIC_API_URL in .env.local (e.g. http://localhost:4000) so the frontend talks to the Express API.
 */
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    const w = window as unknown as { __API_BASE?: string };
    if (w.__API_BASE != null && w.__API_BASE !== "") return w.__API_BASE;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "";
}

/** Storage key for JWT (used when web and API are on different origins). */
export const AUTH_TOKEN_KEY = "doc_platform_token";

export function getAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = getStoredToken();
  const w = window as unknown as { __API_KEY?: string };
  const key = token || w?.__API_KEY || "";
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Get stored JWT from sessionStorage (or window.__API_KEY for dev). */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAuthToken(): void {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/** Default fetch options for API: credentials include (send cookies for session auth). */
export function getFetchOptions(init?: RequestInit): RequestInit {
  return { credentials: "include", ...init };
}

/** Combines auth header and credentials for API fetches. Use: fetch(url, { ...getApiFetchInit(), method: 'POST', body: ... }) */
export function getApiFetchInit(init?: RequestInit): RequestInit {
  return { ...getFetchOptions(init), headers: { ...getAuthHeader(), ...(init?.headers as Record<string, string>) } };
}

/**
 * Parse response as JSON. If the body looks like HTML (e.g. 404 page), log it and throw a clear error.
 * Call this instead of response.json() to avoid "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON".
 */
export async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    const snippet = trimmed.slice(0, 200);
    console.error(
      "[api] Server returned HTML instead of JSON. Is the API URL correct?",
      { url: response.url, status: response.status, snippet }
    );
    throw new Error(
      `Server returned HTML instead of JSON (status ${response.status}). ` +
        `Check that the API is running and NEXT_PUBLIC_API_URL is set (e.g. http://localhost:4000). ` +
        `Response starts with: ${snippet.slice(0, 80)}...`
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("[api] JSON parse failed", { url: response.url, status: response.status, text: text.slice(0, 300) });
    throw new Error(
      `Invalid JSON from server (status ${response.status}). Response: ${text.slice(0, 100)}...`
    );
  }
}
