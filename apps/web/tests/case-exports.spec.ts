import { expect, test, type Page, type Route } from "@playwright/test";

type MockDocument = {
  id: string;
  originalName: string;
  status: string;
  reviewState?: string | null;
  pageCount: number | null;
  createdAt?: string;
  routedCaseId?: string | null;
  providerName?: string | null;
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

type MockOptions = {
  documents: MockDocument[];
  contactsDelay?: Deferred;
  packetDelay?: Deferred;
};

type DownloadClick = {
  href: string;
  download: string;
  target: string;
};

function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function jsonHeaders() {
  return {
    "content-type": "application/json",
  };
}

function fileHeaders(contentType: string, fileName: string) {
  return {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${fileName}"`,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

async function installCasePageMocks(page: Page, options: MockOptions) {
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

  await page.route("**/cases/demo-case-1", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await fulfillJson(route, {
      ok: true,
      item: {
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
          lastExportWasReExport: false,
          lastActorLabel: "ops@demo.com",
        },
        clioHandoffHistory: [
          {
            exportId: "handoff-1",
            exportedAt: "2026-03-18T15:30:00.000Z",
            exportType: "batch",
            exportSubtype: "combined_batch",
            actorLabel: "ops@demo.com",
            archiveFileName: "clio-handoff-batch-2026-03-18.zip",
            contactsFileName: "clio-contacts-batch-2026-03-18.csv",
            mattersFileName: "clio-matters-batch-2026-03-18.csv",
            isReExport: true,
          },
          {
            exportId: "handoff-2",
            exportedAt: "2026-03-17T11:00:00.000Z",
            exportType: "single_case",
            exportSubtype: "contacts",
            actorLabel: "ops@demo.com",
            archiveFileName: null,
            contactsFileName: "DEMO-001-contact.csv",
            mattersFileName: null,
            isReExport: false,
          },
        ],
      },
    });
  });

  await page.route("**/cases/demo-case-1/timeline", async (route) => {
    await fulfillJson(route, { ok: true, items: [] });
  });

  await page.route("**/cases/demo-case-1/providers", async (route) => {
    await fulfillJson(route, { ok: true, items: [] });
  });

  await page.route("**/cases/demo-case-1/documents?includeProvider=true", async (route) => {
    await fulfillJson(route, { ok: true, items: options.documents });
  });

  await page.route("**/cases/demo-case-1/financial", async (route) => {
    await fulfillJson(route, { ok: true, item: { medicalBillsTotal: 0, liensTotal: 0, settlementOffer: 50000 } });
  });

  await page.route("**/cases/demo-case-1/bill-line-items", async (route) => {
    await fulfillJson(route, { ok: true, items: [] });
  });

  await page.route("**/cases/demo-case-1/insights", async (route) => {
    await fulfillJson(route, { ok: true, insights: [] });
  });

  await page.route("**/cases/demo-case-1/exports/clio/contacts.csv", async (route) => {
    if (options.contactsDelay) {
      await options.contactsDelay.promise;
    }
    await route.fulfill({
      status: 200,
      headers: fileHeaders("text/csv", "DEMO-001-contact.csv"),
      body: "first_name,last_name,company,primary_phone,email_address\nAlice,Smith,,,\n",
    });
  });

  await page.route("**/cases/demo-case-1/exports/clio/matters.csv", async (route) => {
    await route.fulfill({
      status: 200,
      headers: fileHeaders("text/csv", "DEMO-001-matter.csv"),
      body: "description,custom_number,status,client_first_name,client_last_name,client_company_name\nSmith v. State Farm,DEMO-001,Open,Alice,Smith,\n",
    });
  });

  await page.route("**/cases/demo-case-1/offers/export-pdf", async (route) => {
    await route.fulfill({
      status: 200,
      headers: fileHeaders("application/pdf", "offers-DEMO-001.pdf"),
      body: "%PDF-1.7\n%Mock offers PDF\n",
    });
  });

  await page.route("**/cases/demo-case-1/exports/packet", async (route) => {
    if (options.packetDelay) {
      await options.packetDelay.promise;
    }
    await fulfillJson(route, {
      ok: true,
      caseId: "demo-case-1",
      packetType: "combined",
      fileName: "case-packet-2026-03-19.zip",
      downloadUrl: "https://downloads.test/case-packet-2026-03-19.zip",
      documentCount: 2,
      includesTimeline: true,
      includesSummary: false,
    });
  });
}

async function openDocumentsTab(page: Page) {
  await page.goto("/dashboard/cases/demo-case-1?tab=documents");
  await expect(page.getByRole("heading", { name: "Case exports" })).toBeVisible();
}

test("documents tab renders case export actions and triggers file exports from the active UI", async ({ page }) => {
  const contactsDelay = deferred();
  await installCasePageMocks(page, {
    contactsDelay,
    documents: [
      { id: "doc-1", originalName: "demo-doc-1.pdf", status: "UPLOADED", reviewState: "EXPORT_READY", pageCount: 1 },
      { id: "doc-2", originalName: "demo-doc-8.pdf", status: "UPLOADED", reviewState: "APPROVED", pageCount: 1 },
    ],
  });

  await openDocumentsTab(page);

  await expect(page.getByText("Clio handoff already recorded")).toBeVisible();
  await expect(page.getByText("Batch Clio handoff • Re-export")).toBeVisible();

  const contactsButton = page.getByRole("button", { name: "Download contacts CSV" });
  const mattersButton = page.getByRole("button", { name: "Download matters CSV" });
  const offersButton = page.getByRole("button", { name: "Download offers PDF" });
  const packetButton = page.getByRole("button", { name: "Download packet" });

  await expect(contactsButton).toBeVisible();
  await expect(mattersButton).toBeVisible();
  await expect(offersButton).toBeVisible();
  await expect(packetButton).toBeVisible();
  await expect(contactsButton).toBeDisabled();
  await expect(mattersButton).toBeDisabled();
  await expect(page.getByText("Clio CSV exports stay blocked by default after first handoff to reduce accidental duplicates.")).toBeVisible();

  await page.getByLabel("Re-export anyway").check();
  const reexportContactsButton = page.getByRole("button", { name: "Re-export contacts CSV" });
  const reexportMattersButton = page.getByRole("button", { name: "Re-export matters CSV" });
  await expect(reexportContactsButton).toBeEnabled();
  await expect(reexportMattersButton).toBeEnabled();
  await expect(page.getByText("This case will be exported again and the new handoff will be recorded as a re-export.")).toBeVisible();

  const contactsRequest = page.waitForRequest((req) => req.method() === "GET" && req.url().endsWith("/cases/demo-case-1/exports/clio/contacts.csv"));
  await reexportContactsButton.click();
  const contactsReq = await contactsRequest;
  expect(contactsReq.headers()["x-clio-reexport"]).toBe("true");
  expect(contactsReq.headers()["idempotency-key"]).toBeTruthy();
  await expect(page.getByRole("button", { name: "Preparing…" })).toBeVisible();
  await expect(reexportMattersButton).toBeDisabled();
  await expect(offersButton).toBeDisabled();
  contactsDelay.resolve();
  await expect(page.getByText("Contacts CSV download started.")).toBeVisible();

  const mattersRequest = page.waitForRequest((req) => req.method() === "GET" && req.url().endsWith("/cases/demo-case-1/exports/clio/matters.csv"));
  await reexportMattersButton.click();
  const mattersReq = await mattersRequest;
  expect(mattersReq.headers()["x-clio-reexport"]).toBe("true");
  expect(mattersReq.headers()["idempotency-key"]).toBeTruthy();
  await expect(page.getByText("Matters CSV download started.")).toBeVisible();

  const offersRequest = page.waitForRequest((req) => req.method() === "GET" && req.url().endsWith("/cases/demo-case-1/offers/export-pdf"));
  await offersButton.click();
  await offersRequest;
  await expect(page.getByText("Offers PDF download started.")).toBeVisible();

  const clicks = await page.evaluate(() => {
    const w = window as Window & { __downloadClicks?: DownloadClick[] };
    return (w.__downloadClicks ?? []).map((item) => item.download);
  });
  expect(clicks).toContain("DEMO-001-contact.csv");
  expect(clicks).toContain("DEMO-001-matter.csv");
  expect(clicks).toContain("offers-DEMO-001.pdf");
});

test("packet export can be triggered from the active UI and shows loading plus success feedback", async ({ page }) => {
  const packetDelay = deferred();
  await installCasePageMocks(page, {
    packetDelay,
    documents: [
      { id: "doc-1", originalName: "demo-doc-1.pdf", status: "UPLOADED", reviewState: "EXPORT_READY", pageCount: 1 },
      { id: "doc-2", originalName: "demo-doc-8.pdf", status: "UPLOADED", reviewState: "APPROVED", pageCount: 1 },
    ],
  });

  await openDocumentsTab(page);
  await expect(page.getByText("1 export-ready document available for packet export.")).toBeVisible();

  const packetButton = page.getByRole("button", { name: "Download packet" });
  const contactsButton = page.getByRole("button", { name: "Download contacts CSV" });

  const packetRequest = page.waitForRequest((req) => req.method() === "POST" && req.url().endsWith("/cases/demo-case-1/exports/packet"));
  await packetButton.click();
  await packetRequest;
  await expect(page.getByRole("button", { name: "Preparing…" })).toBeVisible();
  await expect(contactsButton).toBeDisabled();
  packetDelay.resolve();
  await expect(page.getByText("Packet export ready for 2 documents. Download should begin now.")).toBeVisible();

  const packetClick = await page.evaluate(() => {
    const w = window as Window & { __downloadClicks?: DownloadClick[] };
    return (w.__downloadClicks ?? []).find((item) => item.download === "case-packet-2026-03-19.zip") ?? null;
  });
  expect(packetClick).toMatchObject({
    href: "https://downloads.test/case-packet-2026-03-19.zip",
    download: "case-packet-2026-03-19.zip",
    target: "_blank",
  });
});

test("blocked packet readiness state shows the gating message", async ({ page }) => {
  await installCasePageMocks(page, {
    documents: [
      { id: "doc-1", originalName: "reviewed-doc.pdf", status: "UPLOADED", reviewState: "APPROVED", pageCount: 1 },
    ],
  });

  await openDocumentsTab(page);
  await expect(page.getByText("Packet export requires at least one document marked export-ready.")).toBeVisible();
});
