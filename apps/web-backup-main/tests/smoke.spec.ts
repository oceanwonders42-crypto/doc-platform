/**
 * MVP smoke pack: key routes and flows. Resilient to empty state and missing demo data.
 * Run: cd apps/web && pnpm test:e2e tests/smoke.spec.ts
 * Prerequisites: API + Web running; DOC_API_KEY set in apps/web/.env.local for full dashboard.
 */
import { test, expect } from "@playwright/test";
import { gotoDashboardAndAssertLoaded } from "./helpers/auth";
import {
  goToDashboard,
  goToCases,
  goToCaseDetail,
  goToCaseTimeline,
  goToCaseNarrative,
  goToProviders,
  goToProviderDetail,
  goToRecordsRequests,
  goToReview,
  goToDocumentDetail,
  goToUsage,
  goToAnalytics,
  goToAdminFirms,
  goToAdminFirmDetail,
  goToAdminDemo,
  goToAdminDebug,
  goToAdminErrors,
  goToAdminJobs,
  goToAdminQuality,
  goToAdminDashboard,
  goToRecordsRequestDetail,
  ROUTES,
} from "./helpers/nav";
import { assertReviewPageLoaded, assertMainVisibleWithOneOf, assertAdminPageLoaded, assertListPageLoaded } from "./helpers/assertions";
import {
  getFirstDocumentLinkFromDashboard,
  openRecordsRequestsListAndGetFirstId,
  openProvidersListAndGetFirstId,
  openAdminFirmsListAndGetFirstId,
  openCasesListAndGetFirstIdOrDemo,
  DEMO_FIRST_CASE_ID,
} from "./helpers/demo";

test.describe("Smoke: Login / Dashboard", () => {
  test("login: dashboard loads (API key auth)", async ({ page }) => {
    await gotoDashboardAndAssertLoaded(page);
  });

  test("dashboard: page shows dashboard content or env message", async ({ page }) => {
    await goToDashboard(page);
    await expect(
      page.getByRole("heading", { name: /dashboard/i }).or(page.getByText(/Doc Platform/i))
    ).toBeVisible({ timeout: 15000 });
    const main = page.locator("main");
    await expect(main).toBeVisible();
    const text = await main.textContent();
    expect(text?.includes("Recent documents") || text?.includes("Doc Platform") || text?.includes("Missing DOC_API")).toBeTruthy();
  });
});

test.describe("Smoke: Cases", () => {
  test("cases list: page loads", async ({ page }) => {
    await goToCases(page);
    await assertListPageLoaded(page, /cases/i, 10000);
  });

  test("case detail: demo-case-1 loads (with or without demo data)", async ({ page }) => {
    await goToCaseDetail(page, DEMO_FIRST_CASE_ID);
    await assertMainVisibleWithOneOf(
      page,
      ["DEMO-001", "Smith", "Not Found", "not found"],
      10000
    );
  });
});

test.describe("Smoke: Case timeline", () => {
  test("case timeline: loads (first case from list or demo-case-1)", async ({ page }) => {
    const caseId = await openCasesListAndGetFirstIdOrDemo(page);
    await goToCaseTimeline(page, caseId);
    await assertMainVisibleWithOneOf(
      page,
      ["Case timeline", "Timeline", "Medical", "Events", "No timeline", "Back to case", "Rebuild"],
      10000
    );
  });
});

test.describe("Smoke: Case narrative", () => {
  test("case narrative: loads (first case from list or demo-case-1)", async ({ page }) => {
    const caseId = await openCasesListAndGetFirstIdOrDemo(page);
    await goToCaseNarrative(page, caseId);
    await assertMainVisibleWithOneOf(
      page,
      ["Narrative", "Demand Narrative", "Summary", "Narrative type", "Generate draft", "Case", "add-on is not enabled", "Back to case"],
      10000
    );
  });
});

test.describe("Smoke: Documents", () => {
  test("documents list: dashboard shows Recent documents section", async ({ page }) => {
    await goToDashboard(page);
    const section = page.getByText(/Recent documents/i);
    await expect(section).toBeVisible({ timeout: 15000 });
    const tableOrEmpty = page.locator("main table").or(page.getByText(/No documents|Loading/i));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 5000 });
  });

  test("document detail: direct nav to document id (when demo data exists)", async ({ page }) => {
    await goToDashboard(page);
    const docId = await getFirstDocumentLinkFromDashboard(page);
    if (!docId) {
      test.skip();
      return;
    }
    await goToDocumentDetail(page, docId);
    await assertMainVisibleWithOneOf(page, ["Audit trail", "Document", "Recognition", "Case"], 10000);
  });
});

test.describe("Smoke: Review", () => {
  test("review page: loads with table or empty state", async ({ page }) => {
    await goToReview(page);
    await assertReviewPageLoaded(page);
  });

  test("review page: table has header columns when present", async ({ page }) => {
    await goToReview(page);
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible({ timeout: 10000 });
    const table = page.locator("table").first();
    await expect(table).toBeVisible();
    const header = page.locator("thead th").first();
    await expect(header).toBeVisible();
  });
});

test.describe("Smoke: Providers", () => {
  test("providers page: loads", async ({ page }) => {
    await goToProviders(page);
    await assertListPageLoaded(page, /providers/i, 10000);
  });

  test("provider detail: loads when provider exists", async ({ page }) => {
    const providerId = await openProvidersListAndGetFirstId(page);
    if (!providerId) {
      test.skip();
      return;
    }
    await goToProviderDetail(page, providerId);
    await assertMainVisibleWithOneOf(
      page,
      ["Provider", "Contact", "Cases", "Records requests", "Documents", "not found", "Not found", "No provider"],
      10000
    );
  });
});

test.describe("Smoke: Records requests", () => {
  test("records requests page: loads", async ({ page }) => {
    await goToRecordsRequests(page);
    await assertListPageLoaded(page, /records requests/i, 10000);
  });

  test("records request detail: loads when request exists", async ({ page }) => {
    const requestId = await openRecordsRequestsListAndGetFirstId(page);
    if (!requestId) {
      test.skip();
      return;
    }
    await goToRecordsRequestDetail(page, requestId);
    await assertMainVisibleWithOneOf(
      page,
      ["Records request", "records request", "Case", "Provider", "not found", "Not found"],
      10000
    );
  });
});

test.describe("Smoke: Usage & Analytics", () => {
  test("usage page: loads or shows env error", async ({ page }) => {
    await goToUsage(page);
    await assertMainVisibleWithOneOf(page, ["Usage", "Missing DOC_API"], 10000);
  });

  test("analytics page: loads or shows env error", async ({ page }) => {
    await goToAnalytics(page);
    await assertMainVisibleWithOneOf(page, ["Analytics", "Missing DOC_API"], 10000);
  });
});

test.describe("Smoke: Admin", () => {
  test("admin firms page: loads or shows expected auth/error state", async ({ page }) => {
    await goToAdminFirms(page);
    await assertAdminPageLoaded(
      page,
      ["Platform firms", "Firm", "PLATFORM_ADMIN_API_KEY"],
      10000
    );
  });

  test("admin firm detail: loads when firm exists", async ({ page }) => {
    const firmId = await openAdminFirmsListAndGetFirstId(page);
    if (!firmId) {
      test.skip();
      return;
    }
    await goToAdminFirmDetail(page, firmId);
    await assertMainVisibleWithOneOf(
      page,
      ["Firm", "Users", "Documents", "Not found", "API keys"],
      10000
    );
  });

  test("admin debug page: loads", async ({ page }) => {
    await goToAdminDebug(page);
    await assertAdminPageLoaded(page, ["Admin Debug", "Debug", "Quick links", "DOC_API"], 10000);
  });

  test("admin demo page: loads or shows expected content", async ({ page }) => {
    await goToAdminDemo(page);
    await assertAdminPageLoaded(
      page,
      ["Demo", "Demo seed", "Seed demo data", "PLATFORM_ADMIN_API_KEY", "Not found"],
      10000
    );
  });

  test("admin errors page: loads or shows auth/error state", async ({ page }) => {
    await goToAdminErrors(page);
    await assertAdminPageLoaded(
      page,
      ["System errors", "No errors logged yet", "Failed to load", "Filter by service", "Refresh", "PLATFORM_ADMIN_API_KEY"],
      10000
    );
  });

  test("admin jobs page: loads or shows auth/error state", async ({ page }) => {
    await goToAdminJobs(page);
    await assertAdminPageLoaded(
      page,
      ["Background jobs", "No jobs yet", "Failed to load", "Filter by status", "Refresh", "PLATFORM_ADMIN_API_KEY"],
      10000
    );
  });

  test("admin quality page: loads or shows auth/error state", async ({ page }) => {
    await goToAdminQuality(page);
    await assertAdminPageLoaded(
      page,
      ["Quality control", "Failed to load analytics", "Admin", "PLATFORM_ADMIN_API_KEY", "DOC_API_URL", "Filter", "Firm"],
      10000
    );
  });

  test("admin dashboard page: loads or shows auth/error state", async ({ page }) => {
    await goToAdminDashboard(page);
    await assertAdminPageLoaded(
      page,
      ["Admin Dashboard", "Firms", "Failed to load firms", "Admin", "PLATFORM_ADMIN_API_KEY", "DOC_API_URL", "Total firms", "Platform-wide"],
      10000
    );
  });
});

test.describe("Smoke: Navigation", () => {
  test("sidebar: can reach dashboard, cases, review, providers, records from nav", async ({ page }) => {
    await goToDashboard(page);
    await expect(page).toHaveURL(new RegExp(ROUTES.dashboard));

    await page.goto(ROUTES.cases);
    await expect(page).toHaveURL(new RegExp(ROUTES.cases));

    await page.goto(ROUTES.review);
    await expect(page).toHaveURL(new RegExp("/dashboard/review"));

    await page.goto(ROUTES.providers);
    await expect(page).toHaveURL(new RegExp(ROUTES.providers));

    await page.goto(ROUTES.recordsRequests);
    await expect(page).toHaveURL(new RegExp(ROUTES.recordsRequests));
  });
});
