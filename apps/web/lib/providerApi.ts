/**
 * Provider API client for cookie-based auth.
 * Uses NEXT_PUBLIC_DOC_API_URL for client-side requests (credentials: include).
 */
export function getProviderApiUrl(): string {
  if (typeof window !== "undefined") {
    return (process.env.NEXT_PUBLIC_DOC_API_URL || process.env.DOC_API_URL || "http://localhost:4000").replace(/\/$/, "");
  }
  return (process.env.DOC_API_URL || process.env.NEXT_PUBLIC_DOC_API_URL || "http://localhost:4000").replace(/\/$/, "");
}

export async function providerFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getProviderApiUrl();
  const url = path.startsWith("http") ? path : `${base}${path}`;
  return fetch(url, {
    ...init,
    credentials: "include",
  });
}
