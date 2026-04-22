/**
 * Records request automation service.
 * - Create draft from case + provider
 * - Generate default subject/body
 * - Compute dueAt from firm follow-up rule or default
 * - Create event log entries
 * - Validate required fields before send
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { buildFirmWhere } from "../lib/tenant";
import {
  normalizeRecordsRequestStatus,
  type RecordsRequestStatus,
} from "./recordsRequestStatus";

export type RequestType = "RECORDS" | "BILLS" | "BOTH";
export type RequestStatus = RecordsRequestStatus;
export type DestinationType = "EMAIL" | "FAX" | "PORTAL" | "MANUAL";
export type RecordsRequestWithRelations = Prisma.RecordsRequestGetPayload<{
  include: {
    attachments: true;
    events: { orderBy: { createdAt: "desc" } };
  };
}>;

export type CreateRecordsRequestInput = {
  firmId: string;
  caseId: string;
  providerId?: string | null;
  /** When providerId is not set, use this as display name for the request */
  providerName?: string | null;
  providerContact?: string | null;
  notes?: string | null;
  patientName?: string | null;
  patientDob?: Date | null;
  dateOfLoss?: Date | null;
  requestType?: RequestType | null;
  destinationType?: DestinationType | null;
  destinationValue?: string | null;
  subject?: string | null;
  messageBody?: string | null;
  requestedDateFrom?: Date | null;
  requestedDateTo?: Date | null;
  createdByUserId?: string | null;
};

export type CreateRecordsRequestResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const DEFAULT_SUBJECT = "Medical Records Request";
const DEFAULT_BODY_RECORDS = `Please provide complete medical records for the patient and dates of service indicated. This request is made in connection with pending legal matter.`;
const DEFAULT_BODY_BILLS = `Please provide itemized billing statements and any outstanding balance for the patient and dates of service indicated.`;
const DEFAULT_BODY_BOTH = `Please provide complete medical records and itemized billing statements for the patient and dates of service indicated. This request is made in connection with pending legal matter.`;

export async function createRecordsRequestDraft(
  input: CreateRecordsRequestInput
): Promise<CreateRecordsRequestResult> {
  const { firmId, caseId, providerId, createdByUserId } = input;
  if (!firmId || !caseId) {
    return { ok: false, error: "firmId and caseId are required" };
  }

  const [caseRow, provider, rule] = await Promise.all([
    prisma.legalCase.findFirst({
      where: buildFirmWhere(firmId, { id: caseId }),
      select: {
        id: true,
        title: true,
        caseNumber: true,
        clientName: true,
      },
    }),
    providerId
      ? prisma.provider.findFirst({
          where: buildFirmWhere(firmId, { id: providerId }),
          select: {
            id: true,
            name: true,
            email: true,
            fax: true,
            address: true,
            city: true,
            state: true,
            phone: true,
          },
        })
      : Promise.resolve(null),
    prisma.recordsRequestFollowUpRule.findFirst({
      where: buildFirmWhere(firmId),
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!caseRow) return { ok: false, error: "Case not found" };

  const hasProvider = !!provider;
  const hasName = !!(input.providerName?.trim() || input.patientName?.trim());
  if (!hasProvider && !hasName) {
    return { ok: false, error: "providerId or providerName (or patientName) is required" };
  }

  const requestType = (input.requestType || "RECORDS") as RequestType;
  const subject =
    input.subject?.trim() ||
    (requestType === "BILLS"
      ? "Billing Records Request"
      : requestType === "BOTH"
        ? "Medical Records and Billing Request"
        : DEFAULT_SUBJECT);
  let messageBody = input.messageBody?.trim();
  if (!messageBody) {
    if (requestType === "BILLS") messageBody = DEFAULT_BODY_BILLS;
    else if (requestType === "BOTH") messageBody = DEFAULT_BODY_BOTH;
    else messageBody = DEFAULT_BODY_RECORDS;
  }

  const destinationType = (input.destinationType || "EMAIL") as DestinationType;
  let destinationValue = input.destinationValue?.trim();
  if (!destinationValue && provider) {
    if (destinationType === "EMAIL" && provider.email) destinationValue = provider.email;
    else if (destinationType === "FAX" && provider.fax) destinationValue = provider.fax;
  }

  const dueAt = rule?.enabled
    ? (() => {
        const d = new Date();
        d.setDate(d.getDate() + rule.daysAfterSend);
        return d;
      })()
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d;
      })();

  const providerName =
    provider?.name ?? (input.providerName?.trim() || null) ?? input.patientName ?? "Provider";
  const providerContact =
    provider?.email || provider?.phone || provider?.fax
      ? [provider?.email, provider?.phone, provider?.fax].filter(Boolean).join(" | ")
      : (input.providerContact?.trim() || null) ?? input.destinationValue ?? null;

  const record = await prisma.recordsRequest.create({
    data: {
      firmId,
      caseId,
      providerId: providerId ?? null,
      providerName,
      providerContact,
      dateFrom: input.requestedDateFrom ?? null,
      dateTo: input.requestedDateTo ?? null,
      notes: input.notes?.trim() || null,
      letterBody: messageBody,
      status: "DRAFT",
      patientName: input.patientName ?? caseRow.clientName ?? null,
      patientDob: input.patientDob ?? null,
      dateOfLoss: input.dateOfLoss ?? null,
      requestType,
      destinationType,
      destinationValue,
      subject,
      messageBody,
      requestedDateFrom: input.requestedDateFrom ?? null,
      requestedDateTo: input.requestedDateTo ?? null,
      dueAt,
      createdByUserId: createdByUserId ?? null,
    },
  });

  await prisma.recordsRequestEvent.create({
    data: {
      firmId,
      recordsRequestId: record.id,
      eventType: "CREATED",
      status: "DRAFT",
      message: "Draft created",
      metaJson: { caseId, providerId: providerId ?? null, requestType },
    },
  });

  return { ok: true, id: record.id };
}

export async function validateForSend(
  recordsRequestId: string,
  firmId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const req = await prisma.recordsRequest.findFirst({
    where: buildFirmWhere(firmId, { id: recordsRequestId }),
  });
  if (!req) return { ok: false, error: "Records request not found" };
  const status = normalizeRecordsRequestStatus(req.status);
  if (status !== "DRAFT" && status !== "FAILED" && status !== "FOLLOW_UP_DUE") {
    return { ok: false, error: "Request must be in DRAFT, FAILED, or FOLLOW_UP_DUE status to send" };
  }
  const body = (req.messageBody ?? req.letterBody ?? "").trim();
  if (!body) return { ok: false, error: "Message body is required" };
  const destType = req.destinationType ?? "EMAIL";
  if (destType === "EMAIL") {
    const dest = (req.destinationValue ?? "").trim();
    if (!dest) return { ok: false, error: "Destination email is required" };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
      return { ok: false, error: "Invalid email address" };
    }
  }
  if (destType === "FAX") {
    const dest = (req.destinationValue ?? "").trim();
    if (!dest) return { ok: false, error: "Destination fax number is required" };
  }
  return { ok: true };
}

export async function getRequestWithRelations(
  id: string,
  firmId: string
): Promise<RecordsRequestWithRelations | null> {
  const request = await prisma.recordsRequest.findFirst({
    where: buildFirmWhere(firmId, { id }),
    include: {
      attachments: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  });
  return request;
}
