import { expect, test, type Page, type Route } from "@playwright/test";

type DownloadClick = {
  href: string;
  download: string;
  target: string;
};

type TimelineEvent = {
  id: string;
  eventDate: string | null;
  eventType: string | null;
  track: string | null;
  provider: string | null;
  diagnosis: string | null;
  procedure: string | null;
  amount: string | number | null;
  metadataJson?: { dateUncertain?: boolean; dateSource?: string; providerSource?: string } | null;
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

async function installDashboardShellMocks(page: Page) {
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

  await page.route("**/me/features", async (route) => {
    await fulfillJson(route, { ok: true, features: [] });
  });
}

test("documents page falls back to the proxy when the direct API target returns HTML", async ({ page }) => {
  await installDashboardShellMocks(page);

  await page.route("**/me/documents**", async (route) => {
    await route.fulfill({
      status: 404,
      headers: { "content-type": "text/html" },
      body: "<html><body>Not found</body></html>",
    });
  });

  await page.route("**/api/documents**", async (route) => {
    await fulfillJson(route, {
      ok: true,
      items: [
        {
          id: "doc-1",
          originalName: "intake-record.pdf",
          status: "UPLOADED",
          pageCount: 3,
          routedCaseId: "case-1",
          createdAt: "2026-04-21T12:00:00.000Z",
          processedAt: null,
        },
      ],
    });
  });

  await page.goto("/dashboard/documents");

  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(page.getByText("intake-record.pdf")).toBeVisible();
  await expect(page.getByText(/returned HTML instead of JSON/i)).toHaveCount(0);
});

test("documents page shows a deployment-style error when both API targets return HTML", async ({ page }) => {
  await installDashboardShellMocks(page);

  await page.route("**/me/documents**", async (route) => {
    await route.fulfill({
      status: 404,
      headers: { "content-type": "text/html" },
      body: "<html><body>Missing direct API route</body></html>",
    });
  });

  await page.route("**/api/documents**", async (route) => {
    await route.fulfill({
      status: 404,
      headers: { "content-type": "text/html" },
      body: "<html><body>Missing proxy route</body></html>",
    });
  });

  await page.goto("/dashboard/documents");

  await expect(
    page.getByText(/The documents API target returned HTML instead of JSON/i)
  ).toBeVisible();
});

test("demand tab shows chronology tools and exports without leaving the demand workflow", async ({ page }) => {
  await installDashboardShellMocks(page);

  const timelineItems: TimelineEvent[] = [
    {
      id: "event-1",
      eventDate: "2026-03-01T00:00:00.000Z",
      eventType: "Visit",
      track: "medical",
      provider: "Onyx Medical Group",
      diagnosis: "Cervical strain",
      procedure: "Evaluation",
      amount: null,
    },
    {
      id: "event-2",
      eventDate: "2026-03-08T00:00:00.000Z",
      eventType: "Treatment",
      track: "medical",
      provider: "Onyx Physical Therapy",
      diagnosis: "Whiplash",
      procedure: "Physical therapy",
      amount: null,
    },
    {
      id: "event-3",
      eventDate: "2026-03-15T00:00:00.000Z",
      eventType: "Imaging",
      track: "medical",
      provider: "Onyx Imaging",
      diagnosis: "Disc bulge",
      procedure: "MRI",
      amount: null,
    },
    {
      id: "event-4",
      eventDate: "2026-03-20T00:00:00.000Z",
      eventType: "Follow-up",
      track: "medical",
      provider: "Onyx Medical Group",
      diagnosis: "Lumbar strain",
      procedure: "Recheck",
      amount: null,
    },
    {
      id: "event-5",
      eventDate: "2026-03-27T00:00:00.000Z",
      eventType: "Procedure",
      track: "medical",
      provider: "Onyx Pain Center",
      diagnosis: "Persistent pain",
      procedure: "Injection",
      amount: null,
    },
    {
      id: "event-6",
      eventDate: "2026-04-02T00:00:00.000Z",
      eventType: "Discharge",
      track: "medical",
      provider: "Onyx Physical Therapy",
      diagnosis: "Improving",
      procedure: "Discharge visit",
      amount: null,
    },
  ];

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
      },
    });
  });

  await page.route("**/cases/demo-case-1/timeline", async (route) => {
    await fulfillJson(route, { ok: true, items: timelineItems });
  });

  await page.route("**/cases/demo-case-1/providers", async (route) => {
    await fulfillJson(route, { ok: true, items: [] });
  });

  await page.route("**/cases/demo-case-1/documents?includeProvider=true", async (route) => {
    await fulfillJson(route, { ok: true, items: [] });
  });

  await page.route("**/cases/demo-case-1/financial", async (route) => {
    await fulfillJson(route, { ok: true, item: { medicalBillsTotal: 12500, liensTotal: 0, settlementOffer: 50000 } });
  });

  await page.route("**/cases/demo-case-1/bill-line-items", async (route) => {
    await fulfillJson(route, { ok: true, items: [] });
  });

  await page.route("**/cases/demo-case-1/insights", async (route) => {
    await fulfillJson(route, { ok: true, insights: [] });
  });

  await page.route("**/cases/demo-case-1/timeline/export?format=pdf", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="demo-001-chronology.pdf"',
      },
      body: "%PDF-1.7\n%Mock chronology PDF\n",
    });
  });

  await page.route("**/cases/demo-case-1/timeline/export?format=docx", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": 'attachment; filename="demo-001-chronology.docx"',
      },
      body: "mock-docx",
    });
  });

  await page.goto("/dashboard/cases/demo-case-1?tab=demands");

  await expect(page.getByRole("heading", { name: "Chronology for demand drafting" })).toBeVisible();
  await expect(page.getByText("Timeline events")).toBeVisible();
  await expect(page.getByText("Providers in chronology")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export chronology PDF" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Export chronology DOCX" })).toBeEnabled();
  await expect(page.getByText(/Showing the first 5 of 6 chronology events/i)).toBeVisible();

  await page.getByRole("button", { name: "Export chronology PDF" }).click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const w = window as Window & { __downloadClicks?: DownloadClick[] };
        return (w.__downloadClicks ?? []).map((item) => item.download);
      })
    )
    .toContain("demo-001-chronology.pdf");
});
