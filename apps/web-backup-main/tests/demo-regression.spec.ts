/**
 * Demo-flow regression: seeded paths for local demo environment.
 *
 * Run: cd apps/web && pnpm test:e2e tests/demo-regression.spec.ts
 *
 * Env / services required for full run:
 * - Web app (http://localhost:3000)
 * - API (DOC_API_URL, e.g. http://127.0.0.1:4000)
 * - DOC_API_KEY in apps/web/.env.local (key for a seeded firm)
 * - Demo seed applied (dashboard "Generate demo data" or apps/api: pnpm run seed:demo:http)
 *
 * Gating: Tests call skipWhenDemoEnvUnavailable(page) after loading the dashboard;
 * when the dashboard shows "Missing DOC_API…", the test is skipped (safe for CI without API/key).
 */
import { test, expect } from "@playwright/test";
import { ensureSeededDashboard } from "./helpers/auth";
import { goToDocumentDetail, goToProviderDetail, goToReview, goToRecordsRequestDetail, goToCaseTimeline, goToCaseNarrative } from "./helpers/nav";
import { assertMainVisible, assertMainVisibleWithOneOf, assertReviewPageLoaded } from "./helpers/assertions";
import { getFirstDocumentLinkFromDashboard, goToFirstCaseFromDashboard, openCasesListAndGetFirstIdOrDemo, openProvidersListAndGetFirstId, openRecordsRequestsListAndGetFirstId } from "./helpers/demo";

test.describe("Demo regression (gated)", () => {
  test("login → dashboard (skips when demo env unavailable)", async ({ page }) => {
    await ensureSeededDashboard(page);
    await assertMainVisible(page, 5000);
    const body = await page.locator("body").textContent();
    expect(body?.includes("Recent documents") || body?.includes("Doc Platform")).toBeTruthy();
  });

  test("full demo path: dashboard → cases → case detail", async ({ page }) => {
    await ensureSeededDashboard(page);

    await goToFirstCaseFromDashboard(page);

    await assertMainVisible(page, 10000);
    await expect(page).toHaveURL(/\/cases\/.+/);
    await assertMainVisibleWithOneOf(
      page,
      ["DEMO-001", "Smith", "Case"],
      5000
    );
  });

  test("dashboard → cases → case timeline", async ({ page }) => {
    await ensureSeededDashboard(page);

    const caseId = await openCasesListAndGetFirstIdOrDemo(page);
    await goToCaseTimeline(page, caseId);
    await assertMainVisible(page, 10000);
    await expect(page).toHaveURL(new RegExp(`/cases/${caseId}/timeline`));
    await assertMainVisibleWithOneOf(
      page,
      ["Timeline", "Case timeline", "Medical", "Events", "No timeline", "Rebuild"],
      5000
    );
  });

  test("dashboard → cases → case narrative", async ({ page }) => {
    await ensureSeededDashboard(page);

    const caseId = await openCasesListAndGetFirstIdOrDemo(page);
    await goToCaseNarrative(page, caseId);
    await assertMainVisible(page, 10000);
    await expect(page).toHaveURL(new RegExp(`/cases/${caseId}/narrative`));
    await assertMainVisibleWithOneOf(
      page,
      ["Demand Narrative", "Narrative type", "Generate draft", "Case", "add-on is not enabled"],
      5000
    );
  });

  test("dashboard → documents → document detail", async ({ page }) => {
    await ensureSeededDashboard(page);

    const docId = await getFirstDocumentLinkFromDashboard(page);
    if (!docId) {
      test.skip();
      return;
    }
    await goToDocumentDetail(page, docId);
    await assertMainVisible(page, 10000);
    await expect(page).toHaveURL(new RegExp(`/documents/${docId}(/|$)`));
    await assertMainVisibleWithOneOf(
      page,
      ["Document", "Audit trail", "Case"],
      5000
    );
  });

  test("dashboard → review queue", async ({ page }) => {
    await ensureSeededDashboard(page);

    await goToReview(page);
    await assertReviewPageLoaded(page, 10000);
    await expect(page).toHaveURL(/\/dashboard\/review/);
  });

  test("dashboard → records requests → records request detail", async ({ page }) => {
    await ensureSeededDashboard(page);

    const requestId = await openRecordsRequestsListAndGetFirstId(page);
    if (!requestId) {
      test.skip();
      return;
    }
    await goToRecordsRequestDetail(page, requestId);
    await assertMainVisible(page, 10000);
    await expect(page).toHaveURL(new RegExp(`/records-requests/${requestId}(/|$)`));
    await assertMainVisibleWithOneOf(
      page,
      ["Records request", "Case", "Provider", "Status", "Not found"],
      5000
    );
  });

  test("dashboard → providers → provider detail", async ({ page }) => {
    await ensureSeededDashboard(page);

    const providerId = await openProvidersListAndGetFirstId(page);
    if (!providerId) {
      test.skip();
      return;
    }
    await goToProviderDetail(page, providerId);
    await assertMainVisible(page, 10000);
    await expect(page).toHaveURL(new RegExp(`/providers/${providerId}(/|$)`));
    await assertMainVisibleWithOneOf(
      page,
      ["Provider", "Documents", "Cases", "No provider"],
      5000
    );
  });
});
