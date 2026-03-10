/**
 * Minimal demo flow (subset of smoke pack). Run: cd apps/web && pnpm test:e2e tests/demo-flow.spec.ts
 * Prerequisites: API + Web running; DOC_API_KEY set for full dashboard. Demo seed optional.
 */
import { test } from "@playwright/test";
import { gotoDashboardAndAssertLoaded } from "./helpers/auth";
import { goToCases, goToCaseDetail } from "./helpers/nav";
import { assertListPageLoaded, assertMainVisibleWithOneOf } from "./helpers/assertions";
import { DEMO_FIRST_CASE_ID } from "./helpers/demo";

test.describe("Demo flow (minimal)", () => {
  test("dashboard loads", async ({ page }) => {
    await gotoDashboardAndAssertLoaded(page);
  });

  test("cases list loads", async ({ page }) => {
    await goToCases(page);
    await assertListPageLoaded(page, /cases/i, 10000);
  });

  test("case detail (demo-case-1) loads", async ({ page }) => {
    await goToCaseDetail(page, DEMO_FIRST_CASE_ID);
    await assertMainVisibleWithOneOf(
      page,
      ["DEMO-001", "Smith", "Not Found", "not found"],
      10000
    );
  });
});
