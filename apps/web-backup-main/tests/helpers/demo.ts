/**
 * Demo data assumptions for E2E. Demo seed creates fixed case IDs and ~10 documents.
 * Use for optional assertions or skipping when demo data is required.
 */
import { Page } from "@playwright/test";
import { clickSidebarLink, goToRecordsRequests, goToProviders, goToAdminFirms, goToCases, ROUTES } from "./nav";
import { assertListPageLoaded, assertAdminPageLoaded } from "./assertions";

/** Case IDs created by demo seed (demo-case-1, demo-case-2, demo-case-3). */
export const DEMO_CASE_IDS = ["demo-case-1", "demo-case-2", "demo-case-3"] as const;

/** Case numbers shown in UI (DEMO-001, etc.). */
export const DEMO_CASE_NUMBERS = ["DEMO-001", "DEMO-002", "DEMO-003"] as const;

/** First demo case ID (Smith v. State Farm). */
export const DEMO_FIRST_CASE_ID = DEMO_CASE_IDS[0];

/**
 * From dashboard, open Cases in sidebar then go to first case (or DEMO_FIRST_CASE_ID if no links).
 * Call only when already on dashboard with demo env (e.g. after skipWhenDemoEnvUnavailable).
 */
export async function goToFirstCaseFromDashboard(page: Page): Promise<void> {
  await clickSidebarLink(page, /Cases/i);
  await page.getByRole("heading", { name: /cases/i }).or(page.getByText(/Cases/i).first()).waitFor({ state: "visible", timeout: 10000 });
  const firstCaseLink = page.locator('main a[href^="/cases/"]').first();
  if ((await firstCaseLink.count()) > 0) {
    await firstCaseLink.click();
  } else {
    await page.goto(ROUTES.caseDetail(DEMO_FIRST_CASE_ID));
  }
}

/**
 * Check if the current page content suggests demo data is present (e.g. DEMO-001 or "Smith").
 * Use for soft assertions or skip conditions.
 */
export async function pageLikelyHasDemoData(page: Page): Promise<boolean> {
  const content = await page.locator("main").textContent();
  if (!content) return false;
  return DEMO_CASE_NUMBERS.some((n) => content.includes(n)) || content.includes("Smith");
}

/**
 * Get first document link href from dashboard "Recent documents" section, if any.
 * Returns null if no document links found. Waits for main to be visible first to avoid load races.
 */
export async function getFirstDocumentLinkFromDashboard(page: Page): Promise<string | null> {
  await page.locator("main").waitFor({ state: "visible", timeout: 10000 });
  const docLink = page.locator('main a[href^="/documents/"]').first();
  const count = await docLink.count();
  if (count === 0) return null;
  const href = await docLink.getAttribute("href");
  if (!href) return null;
  const match = href.match(/^\/documents\/([^/?#]+)/);
  return match ? match[1]! : null;
}

/**
 * Get first records request id from the records-requests list page (must be on that page).
 * Returns null if no request links found.
 */
export async function getFirstRecordsRequestIdFromList(page: Page): Promise<string | null> {
  const link = page.locator('main a[href^="/records-requests/"]').first();
  const count = await link.count();
  if (count === 0) return null;
  const href = await link.getAttribute("href");
  if (!href) return null;
  const match = href.match(/^\/records-requests\/([^/?#]+)/);
  return match ? match[1]! : null;
}

/**
 * Navigate to the records-requests list, wait for it to load, and return the first request id if any.
 * Use for seeded regression or smoke tests; caller should skip when null.
 */
export async function openRecordsRequestsListAndGetFirstId(page: Page): Promise<string | null> {
  await goToRecordsRequests(page);
  await assertListPageLoaded(page, /records requests/i, 10000);
  return getFirstRecordsRequestIdFromList(page);
}

/**
 * Get first case id from the cases list page (must be on that page).
 * Returns null if no case links found. Use with DEMO_FIRST_CASE_ID as fallback for timeline/detail smoke.
 */
export async function getFirstCaseIdFromList(page: Page): Promise<string | null> {
  const link = page.locator('main a[href^="/cases/"]').first();
  const count = await link.count();
  if (count === 0) return null;
  const href = await link.getAttribute("href");
  if (!href || href === "/cases/new") return null;
  const match = href.match(/^\/cases\/([^/?#]+)/);
  return match ? match[1]! : null;
}

/**
 * Navigate to the cases list, wait for it to load, and return the first case id or DEMO_FIRST_CASE_ID.
 * Use for seeded regression or smoke when a case id is required (e.g. timeline, narrative).
 */
export async function openCasesListAndGetFirstIdOrDemo(page: Page): Promise<string> {
  await goToCases(page);
  await assertListPageLoaded(page, /cases/i, 10000);
  return (await getFirstCaseIdFromList(page)) ?? DEMO_FIRST_CASE_ID;
}

/**
 * Get first provider id from the providers list page (must be on that page).
 * Ignores /providers/new. Returns null if no provider links found.
 */
export async function getFirstProviderIdFromList(page: Page): Promise<string | null> {
  const links = page.locator('main a[href^="/providers/"]');
  const n = await links.count();
  for (let i = 0; i < n; i++) {
    const href = await links.nth(i).getAttribute("href");
    if (!href || href === "/providers/new") continue;
    const match = href.match(/^\/providers\/([^/?#]+)/);
    if (match) return match[1]!;
  }
  return null;
}

/**
 * Navigate to the providers list, wait for it to load, and return the first provider id if any.
 * Use for seeded regression or smoke tests; caller should skip when null.
 */
export async function openProvidersListAndGetFirstId(page: Page): Promise<string | null> {
  await goToProviders(page);
  await assertListPageLoaded(page, /providers/i, 10000);
  return getFirstProviderIdFromList(page);
}

/**
 * Get first firm id from the admin firms list page (must be on that page).
 * Returns null if no firm detail links found. Use after goToAdminFirms + assertAdminPageLoaded.
 */
export async function getFirstAdminFirmIdFromList(page: Page): Promise<string | null> {
  const link = page.locator('main a[href^="/admin/firms/"]').first();
  const count = await link.count();
  if (count === 0) return null;
  const href = await link.getAttribute("href");
  if (!href || href === "/admin/firms") return null;
  const match = href.match(/^\/admin\/firms\/([^/?#]+)/);
  return match ? match[1]! : null;
}

/**
 * Navigate to admin firms list, wait for it to load (or auth/error state), and return the first firm id if any.
 * Use for smoke tests; caller should skip when null.
 */
export async function openAdminFirmsListAndGetFirstId(page: Page): Promise<string | null> {
  await goToAdminFirms(page);
  await assertAdminPageLoaded(
    page,
    ["Platform firms", "Firm", "PLATFORM_ADMIN_API_KEY", "Failed to load"],
    10000
  );
  return getFirstAdminFirmIdFromList(page);
}
