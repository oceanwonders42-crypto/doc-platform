/**
 * Centralized demo/seed data for MVP app surfaces.
 * Structure mirrors likely backend models so swapping to real API is straightforward.
 * Replace with API calls or server data when backend is ready.
 *
 * MIGRATION TO LIVE DATA:
 * - Replace this file's seed arrays with fetch/useSWR/React Query (or server components)
 *   calling e.g. GET /api/cases, GET /api/documents, GET /api/activity.
 * - Keep the same TypeScript types (DemoCase, DemoDocument, etc.) as API response shapes,
 *   or map API DTOs to these types in a thin adapter.
 * - demo-dashboard-data.ts: replace getRecentDocuments(), getReviewQueue(), etc. with
 *   API calls; keep the same export names so dashboard page needs no change.
 * - demo-extraction.ts: replace runMockExtraction() with POST /api/extract and
 *   getStoredResult() with GET /api/jobs/:id or GET /api/documents/:id.
 */

// ---- Types (align with future API/DB models) ----

export type DocumentStatus = "Processing" | "Review needed" | "Processed" | "Synced" | "Failed";
export type ReviewPriority = "high" | "medium" | "low";
export type ProviderType =
  | "Emergency"
  | "Primary Care"
  | "Imaging"
  | "Physical Therapy"
  | "Lab"
  | "Specialist"
  | "Hospital";

export interface DemoCase {
  id: string;
  name: string;
  matterNumber: string;
  cmsMatterId?: string;
}

export interface DemoProvider {
  id: string;
  name: string;
  type: ProviderType;
}

export interface DemoDocument {
  id: string;
  caseId: string;
  name: string;
  category: string;
  status: DocumentStatus;
  processedAt: string;
}

export interface DemoTimelineEvent {
  id: string;
  caseId: string;
  date: string;
  eventType: string;
  eventLabel: string;
  providerName: string;
}

export interface DemoBillingLineItem {
  label: string;
  amount: number;
}

export interface DemoBilling {
  caseId: string;
  totalAmount: number;
  lineItems: DemoBillingLineItem[];
}

export interface DemoReviewFlag {
  id: string;
  documentId: string;
  documentName: string;
  caseId: string;
  caseLabel: string;
  reason: string;
  priority: ReviewPriority;
}

export interface DemoSyncActivityItem {
  id: string;
  action: string;
  detail: string;
  at: string;
  success: boolean | null;
}

export interface DemoIntegrationStatus {
  provider: string;
  connected: boolean;
  syncStatus?: "synced" | "syncing" | "failed";
  lastSyncAt: string;
  nextSyncIn: string;
  mattersSynced: number;
}

// ---- Seed data: believable PI-law-firm examples ----

export const seedCases: DemoCase[] = [
  { id: "c1", name: "Johnson v. Defendant", matterNumber: "2024-0847", cmsMatterId: "0847" },
  { id: "c2", name: "Martinez v. City", matterNumber: "2024-0848", cmsMatterId: "0848" },
  { id: "c3", name: "Williams v. Transport Co.", matterNumber: "2024-0849", cmsMatterId: "0849" },
];

export const seedProviders: DemoProvider[] = [
  { id: "p1", name: "City General Hospital", type: "Emergency" },
  { id: "p2", name: "Dr. Smith, Family Med", type: "Primary Care" },
  { id: "p3", name: "Radiology Associates", type: "Imaging" },
  { id: "p4", name: "PT Associates", type: "Physical Therapy" },
  { id: "p5", name: "Quest Diagnostics", type: "Lab" },
  { id: "p6", name: "Metro Urgent Care", type: "Emergency" },
];

export const seedDocuments: DemoDocument[] = [
  { id: "d1", caseId: "c1", name: "ER_Records_Johnson_03-15.pdf", category: "ER Records", status: "Synced", processedAt: "2024-03-06T14:32:00Z" },
  { id: "d2", caseId: "c1", name: "Radiology_Report_MRI_03-20.pdf", category: "Imaging", status: "Processed", processedAt: "2024-03-06T11:18:00Z" },
  { id: "d3", caseId: "c2", name: "Lab_Results_03-19.pdf", category: "Lab Results", status: "Processing", processedAt: "2024-03-06T14:28:00Z" },
  { id: "d4", caseId: "c1", name: "Hospital_Statement_0324.pdf", category: "Bills", status: "Synced", processedAt: "2024-03-05T16:20:00Z" },
  { id: "d5", caseId: "c1", name: "PT_Progress_Notes_03-22.pdf", category: "PT Notes", status: "Review needed", processedAt: "2024-03-05T13:00:00Z" },
  { id: "d6", caseId: "c1", name: "Discharge_Summary_03-16.pdf", category: "Discharge", status: "Failed", processedAt: "2024-03-05T12:00:00Z" },
  { id: "d7", caseId: "c1", name: "Smith_PCP_Notes_03-18.pdf", category: "PCP Notes", status: "Synced", processedAt: "2024-03-06T09:45:00Z" },
];

export const seedTimelineEvents: DemoTimelineEvent[] = [
  { id: "t1", caseId: "c1", date: "03/15/24", eventType: "er_visit", eventLabel: "ER Visit", providerName: "City General Hospital" },
  { id: "t2", caseId: "c1", date: "03/18/24", eventType: "pcp_initial", eventLabel: "PCP Initial", providerName: "Dr. Smith, Family Med" },
  { id: "t3", caseId: "c1", date: "03/20/24", eventType: "imaging", eventLabel: "Imaging", providerName: "Radiology Associates" },
  { id: "t4", caseId: "c1", date: "03/22/24", eventType: "pt_eval", eventLabel: "PT Eval", providerName: "PT Associates" },
  { id: "t5", caseId: "c1", date: "03/25/24", eventType: "pcp_followup", eventLabel: "PCP Follow-up", providerName: "Dr. Smith" },
];

export const seedBilling: DemoBilling[] = [
  {
    caseId: "c1",
    totalAmount: 47_892,
    lineItems: [
      { label: "Hospital", amount: 18_420 },
      { label: "Physician", amount: 12_350 },
      { label: "Imaging", amount: 8_922 },
      { label: "PT", amount: 8_200 },
    ],
  },
  {
    caseId: "c2",
    totalAmount: 12_400,
    lineItems: [
      { label: "Lab", amount: 1_200 },
      { label: "Urgent Care", amount: 11_200 },
    ],
  },
];

export const seedReviewFlags: DemoReviewFlag[] = [
  { id: "rf1", documentId: "d5", documentName: "PT_Progress_Notes_03-22.pdf", caseId: "c1", caseLabel: "Johnson v. Defendant", reason: "Timeline date mismatch", priority: "high" },
  { id: "rf2", documentId: "d3", documentName: "Lab_Results_03-19.pdf", caseId: "c2", caseLabel: "Martinez v. City", reason: "Provider name unclear", priority: "medium" },
  { id: "rf3", documentId: "d6", documentName: "Discharge_Summary_03-16.pdf", caseId: "c1", caseLabel: "Johnson v. Defendant", reason: "Billing line item review", priority: "medium" },
];

export const seedSyncActivity: DemoSyncActivityItem[] = [
  { id: "a1", action: "Sync completed", detail: "Johnson v. Defendant → Clio matter #0847", at: "2024-03-06T14:34:00Z", success: true },
  { id: "a2", action: "Documents processed", detail: "3 new documents for Johnson v. Defendant", at: "2024-03-06T14:32:00Z", success: true },
  { id: "a3", action: "Processing", detail: "Lab_Results_03-19.pdf — extracting provider and dates", at: "2024-03-06T14:30:00Z", success: null },
  { id: "a4", action: "Billing extracted", detail: "Hospital_Statement_0324.pdf — $18,420", at: "2024-03-06T14:30:00Z", success: true },
  { id: "a5", action: "Sync failed", detail: "Martinez v. City — connection timeout", at: "2024-03-06T13:15:00Z", success: false },
  { id: "a6", action: "Review flagged", detail: "PT_Progress_Notes_03-22.pdf — timeline date mismatch", at: "2024-03-06T13:00:00Z", success: false },
];

export const seedIntegrationStatus: DemoIntegrationStatus = {
  provider: "Clio",
  connected: true,
  syncStatus: "synced",
  lastSyncAt: "2024-03-06T14:34:00Z",
  nextSyncIn: "~5 min",
  mattersSynced: seedCases.length,
};

// ---- Derived getters (used by dashboard and upload result; replace with API calls later) ----

const caseById = (id: string) => seedCases.find((c) => c.id === id);
const caseName = (caseId: string) => caseById(caseId)?.name ?? "Unknown case";

/** Recent documents with case name resolved, for dashboard table. */
export function getRecentDocuments(limit = 10) {
  return seedDocuments
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      name: d.name,
      case: caseName(d.caseId),
      status: d.status,
      date: d.processedAt,
      category: d.category,
    }));
}

/** Review queue for dashboard panel. */
export function getReviewQueue() {
  return seedReviewFlags.map((r) => ({
    id: r.id,
    documentName: r.documentName,
    caseLabel: r.caseLabel,
    reason: r.reason,
    priority: r.priority,
  }));
}

/** Timeline entries for a case (dashboard preview). */
export function getTimelineForCase(caseId: string) {
  return seedTimelineEvents
    .filter((e) => e.caseId === caseId)
    .map((e) => ({ date: e.date, event: e.eventLabel, provider: e.providerName }));
}

/** Billing for a case. */
export function getBillingForCase(caseId: string): DemoBilling | undefined {
  return seedBilling.find((b) => b.caseId === caseId);
}

/** Activity feed (sync/processing events). */
export function getActivityFeed(limit = 20) {
  return seedSyncActivity.slice(0, limit);
}

/** Dashboard KPIs derived from seed (cases/providers) with firm-wide style totals for demo. */
export function getDashboardKpis() {
  return {
    documentsProcessed: 1247,
    casesActive: seedCases.length,
    providersFound: seedProviders.length,
    billingExtracted: 412_840,
  };
}

/** Integration status. */
export function getIntegrationStatus(): DemoIntegrationStatus {
  return { ...seedIntegrationStatus, mattersSynced: seedCases.length };
}

/** All providers (for extraction mock or dropdowns). */
export function getProviders(): DemoProvider[] {
  return [...seedProviders];
}

/** Timeline entries in simple shape for TreatmentTimelinePreview. */
export function getTimelineEntriesForCase(caseId: string) {
  return getTimelineForCase(caseId);
}
