/**
 * Navigation helpers for E2E. Matches DashboardSidebar and main app routes.
 */
import { Page } from "@playwright/test";

export const ROUTES = {
  dashboard: "/dashboard",
  cases: "/cases",
  caseDetail: (id: string) => `/cases/${id}`,
  caseTimeline: (id: string) => `/cases/${id}/timeline`,
  caseNarrative: (id: string) => `/cases/${id}/narrative`,
  providers: "/providers",
  providerDetail: (id: string) => `/providers/${id}`,
  recordsRequests: "/records-requests",
  recordsRequestDetail: (id: string) => `/records-requests/${id}`,
  review: "/dashboard/review",
  documentDetail: (id: string) => `/documents/${id}`,
  usage: "/dashboard/usage",
  analytics: "/dashboard/analytics",
  adminFirms: "/admin/firms",
  adminFirmDetail: (id: string) => `/admin/firms/${id}`,
  adminDemo: "/admin/demo",
  adminDebug: "/admin/debug",
  adminErrors: "/admin/errors",
  adminJobs: "/admin/jobs",
  adminQuality: "/admin/quality",
  adminDashboard: "/admin/dashboard",
} as const;

export async function goToDashboard(page: Page): Promise<void> {
  await page.goto(ROUTES.dashboard);
}

export async function goToCases(page: Page): Promise<void> {
  await page.goto(ROUTES.cases);
}

export async function goToCaseDetail(page: Page, caseId: string): Promise<void> {
  await page.goto(ROUTES.caseDetail(caseId));
}

export async function goToCaseTimeline(page: Page, caseId: string): Promise<void> {
  await page.goto(ROUTES.caseTimeline(caseId));
}

export async function goToCaseNarrative(page: Page, caseId: string): Promise<void> {
  await page.goto(ROUTES.caseNarrative(caseId));
}

export async function goToProviders(page: Page): Promise<void> {
  await page.goto(ROUTES.providers);
}

export async function goToProviderDetail(page: Page, providerId: string): Promise<void> {
  await page.goto(ROUTES.providerDetail(providerId));
}

export async function goToRecordsRequests(page: Page): Promise<void> {
  await page.goto(ROUTES.recordsRequests);
}

export async function goToReview(page: Page): Promise<void> {
  await page.goto(ROUTES.review);
}

export async function goToDocumentDetail(page: Page, documentId: string): Promise<void> {
  await page.goto(ROUTES.documentDetail(documentId));
}

export async function goToUsage(page: Page): Promise<void> {
  await page.goto(ROUTES.usage);
}

export async function goToAnalytics(page: Page): Promise<void> {
  await page.goto(ROUTES.analytics);
}

export async function goToAdminFirms(page: Page): Promise<void> {
  await page.goto(ROUTES.adminFirms);
}

export async function goToAdminFirmDetail(page: Page, firmId: string): Promise<void> {
  await page.goto(ROUTES.adminFirmDetail(firmId));
}

export async function goToAdminDemo(page: Page): Promise<void> {
  await page.goto(ROUTES.adminDemo);
}

export async function goToAdminDebug(page: Page): Promise<void> {
  await page.goto(ROUTES.adminDebug);
}

export async function goToAdminErrors(page: Page): Promise<void> {
  await page.goto(ROUTES.adminErrors);
}

export async function goToAdminJobs(page: Page): Promise<void> {
  await page.goto(ROUTES.adminJobs);
}

export async function goToAdminQuality(page: Page): Promise<void> {
  await page.goto(ROUTES.adminQuality);
}

export async function goToAdminDashboard(page: Page): Promise<void> {
  await page.goto(ROUTES.adminDashboard);
}

export async function goToRecordsRequestDetail(page: Page, requestId: string): Promise<void> {
  await page.goto(ROUTES.recordsRequestDetail(requestId));
}

/** Click sidebar link by label (e.g. "Dashboard", "Cases", "Review queue"). */
export async function clickSidebarLink(page: Page, label: string | RegExp): Promise<void> {
  await page.getByRole("link", { name: label }).click();
}
