import { test, expect, type Page, type Route, type Request } from "@playwright/test";

type MigrationBatchListItem = {
  id: string;
  label: string | null;
  status: "UPLOADED" | "PROCESSING" | "FAILED" | "NEEDS_REVIEW" | "READY_FOR_EXPORT" | "EXPORTED";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  totalDocuments: number;
  processedDocuments: number;
  remainingDocuments: number;
  needsReviewCount: number;
  unresolvedReviewCount: number;
  lastReviewedAt: string | null;
  routedCaseCount: number;
  handoffCount: number;
  lastExportedAt: string | null;
};

type MigrationBatchDetail = {
  ok: true;
  batch: {
    id: string;
    firmId: string;
    label: string | null;
    source: string;
    status: "NEEDS_REVIEW" | "READY_FOR_EXPORT" | "PROCESSING";
    createdByUserId: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    lastExportedAt: string | null;
  };
  total: number;
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
  documentIds: string[];
  documents: Array<{
    id: string;
    originalName: string;
    status: string;
    processingStage: string;
    reviewState: string | null;
    routedCaseId: string | null;
    routedCaseNumber: string | null;
    routedCaseTitle: string | null;
    routingStatus: string | null;
    confidence: number | null;
    pageCount: number;
    ingestedAt: string;
    processedAt: string | null;
    failureStage: string | null;
    failureReason: string | null;
    recognition: {
      clientName: string | null;
      caseNumber: string | null;
      docType: string | null;
      matchConfidence: number | null;
      matchReason: string | null;
    } | null;
    trafficMatter: {
      id: string;
      citationNumber: string | null;
      defendantName: string | null;
      reviewRequired: boolean;
      status: string;
    } | null;
  }>;
  failed: Array<{
    id: string;
    originalName: string;
    failureStage: string | null;
    failureReason: string | null;
  }>;
  contactCandidates: Array<{
    key: string;
    fullName: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    confidence: number | null;
    matterTypes: string[];
    caseNumbers: string[];
    sourceDocumentIds: string[];
    sourceDocumentNames: string[];
    needsReview: boolean;
  }>;
  matterCandidates: Array<{
    key: string;
    matterType: string;
    description: string;
    customNumber: string;
    status: string;
    clientFullName: string;
    confidence: number | null;
    routedCaseId: string | null;
    trafficMatterId: string | null;
    sourceDocumentIds: string[];
    sourceDocumentNames: string[];
    needsReview: boolean;
    exportReady: boolean;
  }>;
  reviewFlags: Array<{
    code: string;
    severity: "warning" | "error";
    documentId: string;
    message: string;
  }>;
  exportSummary: {
    routedCaseIds: string[];
    routedCaseNumbers: string[];
    readyForClioExport: boolean;
    blockedReason: string | null;
    handoffCount: number;
    lastHandoffAt: string | null;
  };
  handoffHistory: Array<{
    exportId: string;
    exportedAt: string;
    actorLabel: string | null;
    archiveFileName: string | null;
    contactsFileName: string | null;
    mattersFileName: string | null;
    includedCaseCount: number;
    skippedCaseCount: number;
  }>;
};

function jsonHeaders() {
  return { "content-type": "application/json" };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
}

function installSharedAuth(page: Page) {
  page.addInitScript(() => {
    const w = window as Window & { __API_BASE?: string };
    w.__API_BASE = window.location.origin;
    window.sessionStorage.setItem("doc_platform_token", "test-token");
  });

  page.route("**/auth/me", async (route) => {
    await fulfillJson(route, {
      ok: true,
      user: { id: "user-1", email: "ops@example.com", role: "STAFF" },
      firm: { id: "firm-1", name: "Test Firm" },
      role: "STAFF",
      isPlatformAdmin: false,
    });
  });

  page.route("**/me/review-queue**", async (route) => {
    await fulfillJson(route, { items: [] });
  });

  page.route("**/me/features", async (route) => {
    await fulfillJson(route, { ok: true, features: [] });
  });
}

function staleIso(hoursAgo: number) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

test.describe("Migration workflow UI", () => {
  test("list shows triage states, stale cues, and row actions", async ({ page }) => {
    installSharedAuth(page);

    const batches: MigrationBatchListItem[] = [
      {
        id: "batch-review",
        label: "Blocked batch",
        status: "NEEDS_REVIEW",
        createdAt: staleIso(0.25),
        updatedAt: staleIso(0.1),
        completedAt: null,
        totalDocuments: 3,
        processedDocuments: 3,
        remainingDocuments: 0,
        needsReviewCount: 2,
        unresolvedReviewCount: 2,
        lastReviewedAt: null,
        routedCaseCount: 0,
        handoffCount: 0,
        lastExportedAt: null,
      },
      {
        id: "batch-ready",
        label: "Ready batch",
        status: "READY_FOR_EXPORT",
        createdAt: staleIso(0.5),
        updatedAt: staleIso(0.1),
        completedAt: staleIso(0.1),
        totalDocuments: 2,
        processedDocuments: 2,
        remainingDocuments: 0,
        needsReviewCount: 0,
        unresolvedReviewCount: 0,
        lastReviewedAt: staleIso(0.2),
        routedCaseCount: 2,
        handoffCount: 1,
        lastExportedAt: staleIso(0.15),
      },
      {
        id: "batch-stale",
        label: "Stale batch",
        status: "PROCESSING",
        createdAt: staleIso(2), // older than 1 hour -> stale
        updatedAt: staleIso(1.5),
        completedAt: null,
        totalDocuments: 4,
        processedDocuments: 1,
        remainingDocuments: 3,
        needsReviewCount: 1,
        unresolvedReviewCount: 1,
        lastReviewedAt: null,
        routedCaseCount: 0,
        handoffCount: 0,
        lastExportedAt: null,
      },
    ];

    await page.route("**/migration/batches", async (route, request) => {
      if (request.method() !== "GET") {
        await route.fallback();
        return;
      }
      await fulfillJson(route, { ok: true, items: batches });
    });

    await page.goto("/dashboard/migration");
    await expect(page.getByRole("heading", { name: /migration batches/i })).toBeVisible();

    // stale chip shows count
    const staleButton = page.getByRole("button", { name: /stale processing/i });
    await expect(staleButton).toBeVisible();
    await expect(staleButton.getByText("1")).toBeVisible();

    // row actions and cues
    await expect(page.getByRole("link", { name: "Open batch review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open export-ready batch" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review stale batch" })).toBeVisible();
    await expect(page.getByText("Possibly stale")).toBeVisible();
  });

  test("stale filter context card appears and can return to full list", async ({ page }) => {
    installSharedAuth(page);

    const batches: MigrationBatchListItem[] = [
      {
        id: "stale-1",
        label: "Stale One",
        status: "PROCESSING",
        createdAt: staleIso(3),
        updatedAt: staleIso(2.5),
        completedAt: null,
        totalDocuments: 2,
        processedDocuments: 1,
        remainingDocuments: 1,
        needsReviewCount: 0,
        unresolvedReviewCount: 0,
        lastReviewedAt: null,
        routedCaseCount: 0,
        handoffCount: 0,
        lastExportedAt: null,
      },
      {
        id: "fresh-1",
        label: "Fresh Batch",
        status: "PROCESSING",
        createdAt: staleIso(0.2),
        updatedAt: staleIso(0.1),
        completedAt: null,
        totalDocuments: 1,
        processedDocuments: 0,
        remainingDocuments: 1,
        needsReviewCount: 0,
        unresolvedReviewCount: 0,
        lastReviewedAt: null,
        routedCaseCount: 0,
        handoffCount: 0,
        lastExportedAt: null,
      },
    ];

    await page.route("**/migration/batches", async (route, request) => {
      if (request.method() !== "GET") {
        await route.fallback();
        return;
      }
      await fulfillJson(route, { ok: true, items: batches });
    });

    await page.goto("/dashboard/migration");
    const table = page.locator("table").first();
    await expect(table).toBeVisible();

    const staleButton = page.getByRole("button", { name: /stale processing/i });
    await staleButton.click();

    const contextCard = page.getByText("Stale processing view");
    await expect(contextCard).toBeVisible();

    const rowsAfterFilter = await page.locator("tbody tr").count();
    expect(rowsAfterFilter).toBe(1);

    const backButton = page.getByRole("button", { name: /back to all batches/i });
    await backButton.click();

    const rowsAfterReset = await page.locator("tbody tr").count();
    expect(rowsAfterReset).toBe(2);
    await expect(contextCard).toBeHidden();
  });

  test("batch detail renders key sections and review entry", async ({ page }) => {
    installSharedAuth(page);

    const detail: MigrationBatchDetail = {
      ok: true,
      batch: {
        id: "detail-1",
        firmId: "firm-1",
        label: "Detail Batch",
        source: "migration",
        status: "NEEDS_REVIEW",
        createdByUserId: "user-1",
        createdAt: staleIso(5),
        updatedAt: staleIso(4.5),
        completedAt: null,
        lastExportedAt: null,
      },
      total: 2,
      byStatus: { PROCESSING: 1, NEEDS_REVIEW: 1 },
      byStage: { uploaded: 1, complete: 1 },
      documentIds: ["doc-1", "doc-2"],
      documents: [
        {
          id: "doc-1",
          originalName: "scanned-medical.pdf",
          status: "NEEDS_REVIEW",
          processingStage: "classification",
          reviewState: "IN_REVIEW",
          routedCaseId: null,
          routedCaseNumber: null,
          routedCaseTitle: null,
          routingStatus: "needs_review",
          confidence: 0.7,
          pageCount: 3,
          ingestedAt: staleIso(5),
          processedAt: null,
          failureStage: null,
          failureReason: null,
          recognition: {
            clientName: "Alice Smith",
            caseNumber: "SMITH-001",
            docType: "medical_record",
            matchConfidence: 0.72,
            matchReason: "Low-confidence case match",
          },
          trafficMatter: null,
        },
        {
          id: "doc-2",
          originalName: "traffic-citation.pdf",
          status: "PROCESSING",
          processingStage: "extraction",
          reviewState: null,
          routedCaseId: null,
          routedCaseNumber: null,
          routedCaseTitle: null,
          routingStatus: "processing",
          confidence: 0.5,
          pageCount: 1,
          ingestedAt: staleIso(5),
          processedAt: null,
          failureStage: null,
          failureReason: null,
          recognition: {
            clientName: "Bob Driver",
            caseNumber: "TRAFFIC-123",
            docType: "traffic_citation",
            matchConfidence: 0.6,
            matchReason: "Traffic citation detected",
          },
          trafficMatter: {
            id: "traffic-1",
            citationNumber: "TR-123",
            defendantName: "Bob Driver",
            reviewRequired: true,
            status: "REVIEW_REQUIRED",
          },
        },
      ],
      failed: [],
      contactCandidates: [
        {
          key: "alice-smith",
          fullName: "Alice Smith",
          firstName: "Alice",
          lastName: "Smith",
          dateOfBirth: "1980-01-01T00:00:00.000Z",
          confidence: 0.72,
          matterTypes: ["medical_record"],
          caseNumbers: ["SMITH-001"],
          sourceDocumentIds: ["doc-1"],
          sourceDocumentNames: ["scanned-medical.pdf"],
          needsReview: true,
        },
      ],
      matterCandidates: [
        {
          key: "matter-traffic",
          matterType: "TRAFFIC",
          description: "Traffic citation TR-123",
          customNumber: "TRAFFIC-123",
          status: "Review Required",
          clientFullName: "Bob Driver",
          confidence: 0.6,
          routedCaseId: null,
          trafficMatterId: "traffic-1",
          sourceDocumentIds: ["doc-2"],
          sourceDocumentNames: ["traffic-citation.pdf"],
          needsReview: true,
          exportReady: false,
        },
      ],
      reviewFlags: [
        {
          code: "needs_review",
          severity: "warning",
          documentId: "doc-1",
          message: "Still needs review before export.",
        },
      ],
      exportSummary: {
        routedCaseIds: [],
        routedCaseNumbers: [],
        readyForClioExport: false,
        blockedReason: "Resolve flagged documents before export.",
        handoffCount: 0,
        lastHandoffAt: null,
      },
      handoffHistory: [],
    };

    await page.route("**/migration/batches/detail-1", async (route, request: Request) => {
      if (request.method() !== "GET") {
        await route.fallback();
        return;
      }
      await fulfillJson(route, detail);
    });

    await page.goto("/dashboard/migration/detail-1");

    await expect(page.getByRole("heading", { name: /detail batch/i })).toBeVisible();
    await expect(page.getByText("Clio export actions")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review flags" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contact candidates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matter candidates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Documents in batch" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open batch review queue" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Review this doc/i }).first()).toBeVisible();
  });
});
