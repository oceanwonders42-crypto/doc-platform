"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebuildCaseTimeline = rebuildCaseTimeline;
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const notifications_1 = require("./notifications");
const DOC_TYPE_LABELS = {
    court_filing: "Court: Filing",
    court_complaint: "Court: Complaint",
    court_motion: "Court: Motion",
    court_order: "Court: Order",
    court_notice: "Court: Notice",
    court_summons: "Court: Summons",
    insurance_letter: "Insurance: Letter",
    insurance_dec_page: "Insurance: Dec Page",
    insurance_coverage_letter: "Insurance: Coverage Letter",
    insurance_denial_letter: "Insurance: Denial Letter",
    insurance_offer_letter: "Insurance: Offer Letter",
    insurance_adjuster_correspondence: "Insurance: Adjuster Correspondence",
    medical_record: "Medical: Record",
    billing_statement: "Billing: Statement",
    police_report: "Police: Report",
};
function parseDate(s) {
    if (!s || typeof s !== "string")
        return null;
    const d = new Date(s.trim());
    return isNaN(d.getTime()) ? null : d;
}
function getTrack(docType) {
    if (!docType)
        return "medical";
    if (docType === "court_filing" || docType.startsWith("court_"))
        return "legal";
    if (docType === "insurance_letter" || docType.startsWith("insurance_"))
        return "insurance";
    return "medical";
}
function getEventTypeLabel(docType) {
    if (!docType)
        return null;
    return DOC_TYPE_LABELS[docType] ?? docType;
}
async function rebuildCaseTimeline(caseId, firmId) {
    const docs = await prisma_1.prisma.document.findMany({
        where: { routedCaseId: caseId, firmId },
        select: { id: true, extractedFields: true },
    });
    const docIds = docs.map((d) => d.id);
    if (docIds.length === 0) {
        await prisma_1.prisma.caseTimelineEvent.deleteMany({ where: { caseId, firmId } });
        await prisma_1.prisma.caseTimelineRebuild.upsert({
            where: { caseId_firmId: { caseId, firmId } },
            create: { caseId, firmId, rebuiltAt: new Date() },
            update: { rebuiltAt: new Date() },
        });
        return;
    }
    const { rows: recRows } = await pg_1.pgPool.query(`select document_id, doc_type, incident_date from document_recognition where document_id = any($1)`, [docIds]);
    const recByDoc = new Map(recRows.map((r) => [r.document_id, r]));
    await prisma_1.prisma.caseTimelineEvent.deleteMany({ where: { caseId, firmId } });
    for (const doc of docs) {
        const rec = recByDoc.get(doc.id);
        const docType = rec?.doc_type ?? doc.extractedFields?.docType ?? null;
        const track = getTrack(docType);
        const ef = doc.extractedFields || {};
        let eventDate = null;
        let amount = null;
        if (track === "legal") {
            const court = ef.court;
            eventDate =
                parseDate(court?.filingDate) ??
                    parseDate(court?.hearingDate) ??
                    parseDate(rec?.incident_date) ??
                    null;
        }
        else if (track === "insurance") {
            const insurance = ef.insurance;
            eventDate =
                parseDate(insurance?.letterDate) ??
                    parseDate(rec?.incident_date) ??
                    null;
            const offer = insurance?.offerAmount;
            amount = offer != null ? String(offer) : null;
        }
        else {
            const medical = ef.medicalRecord;
            eventDate =
                parseDate(medical?.visitDate) ??
                    parseDate(rec?.incident_date) ??
                    null;
            amount =
                medical?.billingAmount != null ? String(medical.billingAmount) : null;
        }
        const eventType = getEventTypeLabel(docType) ?? rec?.doc_type ?? null;
        let facilityId = null;
        let provider = null;
        let diagnosis = null;
        let procedure = null;
        if (track === "medical") {
            const medical = ef.medicalRecord;
            if (medical) {
                facilityId = medical.facility ?? null;
                provider = medical.provider ?? null;
                diagnosis = medical.diagnosis ?? null;
                procedure = medical.procedure ?? null;
            }
        }
        await prisma_1.prisma.caseTimelineEvent.create({
            data: {
                caseId,
                firmId,
                documentId: doc.id,
                eventDate,
                eventType,
                track,
                facilityId,
                provider,
                diagnosis,
                procedure,
                amount,
                metadataJson: track !== "medical" ? { docType } : undefined,
            },
        });
    }
    await prisma_1.prisma.caseTimelineRebuild.upsert({
        where: { caseId_firmId: { caseId, firmId } },
        create: { caseId, firmId, rebuiltAt: new Date() },
        update: { rebuiltAt: new Date() },
    });
    const legalCase = await prisma_1.prisma.legalCase.findFirst({
        where: { id: caseId, firmId },
        select: { title: true, caseNumber: true },
    });
    const caseLabel = legalCase?.title ?? legalCase?.caseNumber ?? caseId;
    (0, notifications_1.createNotification)(firmId, "timeline_updated", "Timeline updated", `Case timeline was rebuilt: ${caseLabel}`, { caseId }).catch((e) => console.warn("[notifications] timeline_updated failed", e));
}
