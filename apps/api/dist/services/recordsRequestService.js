"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRecordsRequestDraft = createRecordsRequestDraft;
exports.validateForSend = validateForSend;
exports.getRequestWithRelations = getRequestWithRelations;
/**
 * Records request automation service.
 * - Create draft from case + provider
 * - Generate default subject/body
 * - Compute dueAt from firm follow-up rule or default
 * - Create event log entries
 * - Validate required fields before send
 */
const prisma_1 = require("../db/prisma");
const tenant_1 = require("../lib/tenant");
const DEFAULT_SUBJECT = "Medical Records Request";
const DEFAULT_BODY_RECORDS = `Please provide complete medical records for the patient and dates of service indicated. This request is made in connection with pending legal matter.`;
const DEFAULT_BODY_BILLS = `Please provide itemized billing statements and any outstanding balance for the patient and dates of service indicated.`;
const DEFAULT_BODY_BOTH = `Please provide complete medical records and itemized billing statements for the patient and dates of service indicated. This request is made in connection with pending legal matter.`;
async function createRecordsRequestDraft(input) {
    const { firmId, caseId, providerId, createdByUserId } = input;
    if (!firmId || !caseId) {
        return { ok: false, error: "firmId and caseId are required" };
    }
    const [caseRow, provider, rule] = await Promise.all([
        prisma_1.prisma.legalCase.findFirst({
            where: (0, tenant_1.buildFirmWhere)(firmId, { id: caseId }),
            select: {
                id: true,
                title: true,
                caseNumber: true,
                clientName: true,
            },
        }),
        providerId
            ? prisma_1.prisma.provider.findFirst({
                where: (0, tenant_1.buildFirmWhere)(firmId, { id: providerId }),
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
        prisma_1.prisma.recordsRequestFollowUpRule.findFirst({
            where: (0, tenant_1.buildFirmWhere)(firmId),
            orderBy: { createdAt: "desc" },
        }),
    ]);
    if (!caseRow)
        return { ok: false, error: "Case not found" };
    const requestType = (input.requestType || "RECORDS");
    const subject = input.subject?.trim() ||
        (requestType === "BILLS"
            ? "Billing Records Request"
            : requestType === "BOTH"
                ? "Medical Records and Billing Request"
                : DEFAULT_SUBJECT);
    let messageBody = input.messageBody?.trim();
    if (!messageBody) {
        if (requestType === "BILLS")
            messageBody = DEFAULT_BODY_BILLS;
        else if (requestType === "BOTH")
            messageBody = DEFAULT_BODY_BOTH;
        else
            messageBody = DEFAULT_BODY_RECORDS;
    }
    const destinationType = (input.destinationType || "EMAIL");
    let destinationValue = input.destinationValue?.trim();
    if (!destinationValue && provider) {
        if (destinationType === "EMAIL" && provider.email)
            destinationValue = provider.email;
        else if (destinationType === "FAX" && provider.fax)
            destinationValue = provider.fax;
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
    const providerName = provider?.name ?? input.patientName ?? "Provider";
    const providerContact = provider?.email || provider?.phone || provider?.fax
        ? [provider?.email, provider?.phone, provider?.fax].filter(Boolean).join(" | ")
        : input.destinationValue ?? null;
    const record = await prisma_1.prisma.recordsRequest.create({
        data: {
            firmId,
            caseId,
            providerId: providerId ?? null,
            providerName,
            providerContact,
            dateFrom: input.requestedDateFrom ?? null,
            dateTo: input.requestedDateTo ?? null,
            notes: null,
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
    await prisma_1.prisma.recordsRequestEvent.create({
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
async function validateForSend(recordsRequestId, firmId) {
    const req = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id: recordsRequestId }),
    });
    if (!req)
        return { ok: false, error: "Records request not found" };
    if (req.status !== "DRAFT" && req.status !== "FAILED" && req.status !== "FOLLOW_UP_DUE") {
        return { ok: false, error: "Request must be in DRAFT, FAILED, or FOLLOW_UP_DUE status to send" };
    }
    const body = (req.messageBody ?? req.letterBody ?? "").trim();
    if (!body)
        return { ok: false, error: "Message body is required" };
    const destType = req.destinationType ?? "EMAIL";
    if (destType === "EMAIL") {
        const dest = (req.destinationValue ?? "").trim();
        if (!dest)
            return { ok: false, error: "Destination email is required" };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
            return { ok: false, error: "Invalid email address" };
        }
    }
    if (destType === "FAX") {
        const dest = (req.destinationValue ?? "").trim();
        if (!dest)
            return { ok: false, error: "Destination fax number is required" };
    }
    return { ok: true };
}
async function getRequestWithRelations(id, firmId) {
    const request = await prisma_1.prisma.recordsRequest.findFirst({
        where: (0, tenant_1.buildFirmWhere)(firmId, { id }),
        include: {
            attachments: true,
            events: { orderBy: { createdAt: "desc" } },
        },
    });
    return request;
}
