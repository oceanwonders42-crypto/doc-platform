/**
 * Dashboard view over demo seed data.
 * All values derive from demo-seed.ts. Replace this module with API calls when backend is ready.
 */

import {
  getRecentDocuments,
  getReviewQueue,
  getActivityFeed,
  getIntegrationStatus,
  getDashboardKpis,
  getTimelineForCase,
} from "@/lib/demo-seed";

export { seedCases, getTimelineForCase, getBillingForCase } from "@/lib/demo-seed";

export const dashboardKpis = getDashboardKpis();

export const recentDocuments = getRecentDocuments(10);

export const reviewQueue = getReviewQueue();

export const treatmentTimelineEntries = getTimelineForCase("c1");

export const integrationStatus = getIntegrationStatus();

export const activityFeed = getActivityFeed(20);
