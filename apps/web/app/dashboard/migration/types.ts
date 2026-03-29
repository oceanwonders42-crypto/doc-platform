export type MigrationBatchStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "FAILED"
  | "NEEDS_REVIEW"
  | "READY_FOR_EXPORT"
  | "EXPORTED";

export type MigrationBatchListItem = {
  id: string;
  label: string | null;
  status: MigrationBatchStatus;
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

export type MigrationBatchDocument = {
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
};

export type MigrationBatchContactCandidate = {
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
};

export type MigrationBatchMatterCandidate = {
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
};

export type MigrationBatchReviewFlag = {
  code: string;
  severity: "warning" | "error";
  documentId: string;
  message: string;
};

export type MigrationBatchHandoffHistoryItem = {
  exportId: string;
  exportedAt: string;
  actorLabel: string | null;
  archiveFileName: string | null;
  contactsFileName: string | null;
  mattersFileName: string | null;
  includedCaseCount: number;
  skippedCaseCount: number;
};

export type MigrationBatchDetail = {
  batch: {
    id: string;
    firmId: string;
    label: string | null;
    source: string;
    status: MigrationBatchStatus;
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
  documents: MigrationBatchDocument[];
  failed: Array<{
    id: string;
    originalName: string;
    failureStage: string | null;
    failureReason: string | null;
  }>;
  contactCandidates: MigrationBatchContactCandidate[];
  matterCandidates: MigrationBatchMatterCandidate[];
  reviewFlags: MigrationBatchReviewFlag[];
  exportSummary: {
    routedCaseIds: string[];
    routedCaseNumbers: string[];
    readyForClioExport: boolean;
    blockedReason: string | null;
    handoffCount: number;
    lastHandoffAt: string | null;
  };
  handoffHistory: MigrationBatchHandoffHistoryItem[];
};

export type MigrationBatchesResponse = {
  ok?: boolean;
  items?: MigrationBatchListItem[];
  error?: string;
};

export type MigrationBatchDetailResponse = Partial<MigrationBatchDetail> & {
  ok?: boolean;
  error?: string;
};

export type MigrationBatchImportFailure = {
  originalName: string;
  error: string;
};

export type MigrationBatchImportResponse = {
  ok?: boolean;
  batchId?: string;
  importedCount?: number;
  failedCount?: number;
  documentIds?: string[];
  failures?: MigrationBatchImportFailure[];
  batch?: MigrationBatchDetail["batch"];
  error?: string;
};
