import { test, expect, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demo");
  await Promise.all([
    page.waitForURL("**/dashboard"),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  await page.waitForResponse((response) => response.url().includes("/auth/me") && response.status() === 200);
}

test("live seeded migration workflow renders real triage, detail, and review paths", async ({ page }) => {
  await signIn(page);

  const batchesResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/migration/batches") && response.status() === 200
  );
  await page.goto("/dashboard/migration");
  await batchesResponsePromise;

  await expect(page.getByRole("heading", { name: /migration batches/i })).toBeVisible();
  await expect(page.getByText("QA Review Batch")).toBeVisible();
  await expect(page.getByText("QA Ready Batch")).toBeVisible();
  await expect(page.getByText("QA Stale Batch")).toBeVisible();
  await expect(page.getByRole("button", { name: /stale processing/i })).toContainText("1");
  await expect(page.getByRole("link", { name: "Open batch review" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open export-ready batch" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review stale batch" })).toBeVisible();
  await expect(page.getByText("Possibly stale")).toBeVisible();

  await page.getByRole("button", { name: /stale processing/i }).click();
  await expect(page.getByText("Stale processing view")).toBeVisible();
  await expect(page.getByText("QA Stale Batch")).toBeVisible();
  await expect(page.getByText("QA Review Batch")).toHaveCount(0);
  await page.getByRole("button", { name: /back to all batches/i }).click();
  await expect(page.getByText("Stale processing view")).toBeHidden();
  await expect(page.getByText("QA Review Batch")).toBeVisible();

  const detailResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/migration/batches/mig_qa_ready_export") && response.status() === 200
  );
  await page.getByRole("link", { name: "Open export-ready batch" }).click();
  await detailResponsePromise;

  await expect(page.getByRole("heading", { name: "QA Ready Batch" })).toBeVisible();
  await expect(page.getByText("Clio export actions")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review flags" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact candidates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matter candidates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Documents in batch" })).toBeVisible();

  await page.goto("/dashboard/migration");
  const reviewResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/me/review-queue") && response.status() === 200
  );
  await page.getByRole("link", { name: "Open batch review" }).click();
  await reviewResponsePromise;

  await expect(page).toHaveURL(/\/dashboard\/review\?/);
  await expect(page.getByText("Batch-scoped review: QA Review Batch")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review" })).toBeVisible();
});
