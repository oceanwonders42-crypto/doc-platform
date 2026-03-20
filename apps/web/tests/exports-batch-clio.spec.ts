import { expect, test, type Page, type Route } from "@playwright/test";

type DownloadClick = {
  href: string;
  download: string;
  target: string;
};

type BatchCandidate = {
  id: string;
  title: string | null;
  caseNumber: string | null;
  clientName: string | null;
  createdAt: string;
  clioHandoff?: {
    alreadyExported: boolean;
    exportCount: number;
    lastExportedAt: string | null;
    lastExportType: "single_case" | "batch" | null;
    lastExportSubtype: "contacts" | "matters" | "combined_batch" | null;
    lastExportWasReExport?: boolean;
    lastActorLabel: string | null;
  };
  clioBatchExport: {
    status: "eligible" | "already_exported" | "potentially_skipped";
    reason: string;
  };
};

type BatchRouteOptions = {
  status?: number;
  headers?: Record<string, string>;
  body: string;
};

type HandoffHistoryItem = {
  exportId: string;
  exportedAt: string;
  exportType: "single_case" | "batch";
  exportSubtype: "contacts" | "matters" | "combined_batch";
  actorLabel: string | null;
  actorType: string | null;
  actorRole: string | null;
  archiveFileName: string | null;
  contactsFileName: string | null;
  mattersFileName: string | null;
  manifestFileName: string | null;
  contactsRowCount: number | null;
  mattersRowCount: number | null;
  reExportOverride: boolean;
  reExportReason: string | null;
  includedCases: Array<{ caseId: string; caseNumber: string | null; caseTitle: string | null; clientName: string | null; isReExport: boolean }>;
  skippedCases: Array<{ caseId: string; caseNumber: string | null; caseTitle: string | null; clientName: string | null; reason: string }>;
};

function jsonHeaders() {
  return {
    "content-type": "application/json",
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

async function installExportsPageMocks(
  page: Page,
  candidates: BatchCandidate[],
  batchRoute: BatchRouteOptions,
  history: HandoffHistoryItem[] = []
) {
  await page.addInitScript(() => {
    const w = window as Window & {
      __API_BASE?: string;
      __downloadClicks?: DownloadClick[];
    };
    w.__API_BASE = window.location.origin;
    window.sessionStorage.setItem("doc_platform_token", "test-token");

    const clicks: DownloadClick[] = [];
    w.__downloadClicks = clicks;

    HTMLAnchorElement.prototype.click = function clickOverride(this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download, target: this.target });
    };
  });

  await page.route("**/auth/me", async (route) => {
    await fulfillJson(route, {
      ok: true,
      user: { id: "user-1", email: "demo@example.com", role: "STAFF" },
      firm: { id: "firm-1", name: "Demo Firm" },
      role: "STAFF",
      isPlatformAdmin: false,
    });
  });

  await page.route("**/cases", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await fulfillJson(route, { ok: true, items: candidates });
  });

  await page.route("**/cases/exports/clio/history**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await fulfillJson(route, { ok: true, items: history });
  });

  await page.route("**/cases/exports/clio/batch", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: batchRoute.status ?? 200,
      headers: batchRoute.headers,
      body: batchRoute.body,
    });
  });
}

test("exports page renders batch Clio handoff selector and downloads ZIP for selected cases", async ({ page }) => {
  await installExportsPageMocks(
    page,
    [
      {
        id: "demo-case-1",
        title: "Smith v. State Farm",
        caseNumber: "DEMO-001",
        clientName: "Alice Smith",
        createdAt: "2026-03-19T12:00:00.000Z",
        clioHandoff: {
          alreadyExported: true,
          exportCount: 2,
          lastExportedAt: "2026-03-18T15:30:00.000Z",
          lastExportType: "batch",
          lastExportSubtype: "combined_batch",
          lastActorLabel: "ops@demo.com",
        },
        clioBatchExport: {
          status: "already_exported",
          reason: "Already handed off to Clio on 2026-03-18. Turn on include re-exports to export it again.",
        },
      },
      {
        id: "demo-case-2",
        title: "Jones Medical Records",
        caseNumber: "DEMO-002",
        clientName: "Bob Jones",
        createdAt: "2026-03-19T12:05:00.000Z",
        clioBatchExport: {
          status: "eligible",
          reason: "Ready for batch Clio handoff export.",
        },
      },
      {
        id: "demo-case-4",
        title: "Brown Insurance",
        caseNumber: "DEMO-004",
        clientName: "Dan Brown",
        createdAt: "2026-03-19T12:15:00.000Z",
        clioBatchExport: {
          status: "potentially_skipped",
          reason: "This case has no routed documents to export yet.",
        },
      },
    ],
    {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="clio-handoff-batch-2026-03-19.zip"',
      },
      body: "PK\u0003\u0004mock-batch-zip",
    },
    [
      {
        exportId: "handoff-1",
        exportedAt: "2026-03-18T15:30:00.000Z",
        exportType: "batch",
        exportSubtype: "combined_batch",
        actorLabel: "ops@demo.com",
        actorType: "user",
        actorRole: "STAFF",
        archiveFileName: "clio-handoff-batch-2026-03-18.zip",
        contactsFileName: "clio-contacts-batch-2026-03-18.csv",
        mattersFileName: "clio-matters-batch-2026-03-18.csv",
        manifestFileName: "manifest.json",
        contactsRowCount: 2,
        mattersRowCount: 2,
        reExportOverride: true,
        reExportReason: "operator_override",
        includedCases: [
          { caseId: "demo-case-1", caseNumber: "DEMO-001", caseTitle: "Smith v. State Farm", clientName: "Alice Smith", isReExport: true },
          { caseId: "demo-case-2", caseNumber: "DEMO-002", caseTitle: "Jones Medical Records", clientName: "Bob Jones", isReExport: false },
        ],
        skippedCases: [
          { caseId: "demo-case-4", caseNumber: "DEMO-004", caseTitle: "Brown Insurance", clientName: "Dan Brown", reason: "This case has no routed documents to export yet." },
        ],
      },
    ]
  );

  await page.goto("/dashboard/exports");

  await expect(page.getByRole("heading", { name: "Batch Clio handoff export" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Clio handoff history" })).toBeVisible();

  const batchButton = page.getByRole("button", { name: "Download batch Clio handoff ZIP" });
  await expect(batchButton).toBeDisabled();

  await expect(page.getByText("Already handed off to Clio on 2026-03-18. Turn on include re-exports to export it again.")).toBeVisible();
  await expect(page.getByText("Ready for batch Clio handoff export.").first()).toBeVisible();
  await expect(page.getByText("This case has no routed documents to export yet.").first()).toBeVisible();
  await expect(page.getByText("Already handed off 3/18/2026 by ops@demo.com.")).toBeVisible();
  await expect(page.getByText("Turn on include re-exports to select this case again.")).toBeVisible();
  await expect(page.getByText("Included: DEMO-001 (re-export), DEMO-002")).toBeVisible();
  await expect(page.getByText("Re-export override used: operator_override")).toBeVisible();
  await expect(page.getByText("Skipped: DEMO-004 (This case has no routed documents to export yet.)")).toBeVisible();

  await expect(page.getByLabel("Select DEMO-001")).toBeDisabled();
  await page.getByLabel("Select DEMO-002").check();

  await expect(batchButton).toBeEnabled();
  await expect(page.getByText("1 case selected: 1 first-time, 0 re-export, 0 potentially skipped.")).toBeVisible();

  await page.getByLabel("Include re-exports").check();
  await expect(page.getByLabel("Select DEMO-001")).toBeEnabled();
  await page.getByLabel("Select DEMO-001").check();

  const batchRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/cases/exports/clio/batch")
  );
  await batchButton.click();
  const batchRequest = await batchRequestPromise;
  expect(batchRequest.postDataJSON()).toEqual({
    caseIds: ["demo-case-1", "demo-case-2"],
    allowReexport: true,
    reexportReason: "operator_override",
  });
  expect(batchRequest.headers()["idempotency-key"]).toBeTruthy();

  await expect(page.getByText("Batch Clio handoff ZIP download started for 2 selected cases.")).toBeVisible();

  const downloads = await page.evaluate(() => {
    const w = window as Window & { __downloadClicks?: DownloadClick[] };
    return w.__downloadClicks ?? [];
  });
  expect(downloads.map((item) => item.download)).toContain("clio-handoff-batch-2026-03-19.zip");
});

test("exports page shows batch Clio handoff error feedback when the request fails", async ({ page }) => {
  await installExportsPageMocks(
    page,
    [
      {
        id: "demo-case-1",
        title: "Smith v. State Farm",
        caseNumber: "DEMO-001",
        clientName: "Alice Smith",
        createdAt: "2026-03-19T12:00:00.000Z",
        clioBatchExport: {
          status: "eligible",
          reason: "Ready for batch Clio handoff export.",
        },
      },
    ],
    {
      status: 400,
      headers: jsonHeaders(),
      body: JSON.stringify({ ok: false, error: "At least one selected case must be export-ready." }),
    },
    []
  );

  await page.goto("/dashboard/exports");

  const batchButton = page.getByRole("button", { name: "Download batch Clio handoff ZIP" });
  await page.getByLabel("Select DEMO-001").check();
  await batchButton.click();

  await expect(page.getByText("At least one selected case must be export-ready.")).toBeVisible();

  const downloads = await page.evaluate(() => {
    const w = window as Window & { __downloadClicks?: DownloadClick[] };
    return w.__downloadClicks ?? [];
  });
  expect(downloads).toHaveLength(0);
});
