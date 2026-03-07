"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebuildCaseTimeline = rebuildCaseTimeline;
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const notifications_1 = require("./notifications");
const billingExtraction_1 = require("./billingExtraction");
const MATCH_CONFIDENCE_THRESHOLD = 0.8;
/**
 * Match provider/facility text against firm's Provider records.
 * Returns Provider id when confidence >= threshold, else null.
 */
function matchProviderText(providers, providerText) {
    const text = typeof providerText === "string" ? providerText.trim() : "";
    if (!text || text.length < 2 || providers.length === 0)
        return null;
    const lower = text.toLowerCase();
    let best = null;
    for (const p of providers) {
        const pName = (p.name || "").trim();
        if (!pName)
            continue;
        const pLower = pName.toLowerCase();
        let score = 0;
        if (pLower === lower) {
            score = 1;
        }
        else if (pLower.startsWith(lower) || lower.startsWith(pLower)) {
            score = 0.9;
        }
        else if (pLower.includes(lower) || lower.includes(pLower)) {
            const longer = pLower.length >= lower.length ? pLower : lower;
            const shorter = pLower.length >= lower.length ? lower : pLower;
            score = shorter.length / longer.length;
            if (score < 0.5)
                score = 0.5;
        }
        if (score >= MATCH_CONFIDENCE_THRESHOLD && (!best || score > best.score)) {
            best = { id: p.id, score };
        }
    }
    return best?.id ?? null;
}
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
    // Queue 2 Onyx doc types
    er_record: "Medical: ER record",
    imaging_report: "Medical: Imaging report",
    physician_notes: "Medical: Physician notes",
    pcp_notes: "Medical: PCP notes",
    therapy_pt_notes: "Medical: Therapy / PT notes",
    operative_report: "Medical: Operative report",
    medical_bill: "Billing: Medical bill",
    ledger_statement: "Billing: Ledger / statement",
    insurance_correspondence: "Insurance: Correspondence",
    miscellaneous: "Miscellaneous",
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
    const [docs, providers] = await Promise.all([
        prisma_1.prisma.document.findMany({
            where: { routedCaseId: caseId, firmId },
            select: { id: true, extractedFields: true },
        }),
        prisma_1.prisma.provider.findMany({
            where: { firmId },
            select: { id: true, name: true },
        }),
    ]);
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
    const { rows: recRows } = await pg_1.pgPool.query(`select document_id, doc_type, incident_date, provider_name, facility_name, summary from document_recognition where document_id = any($1)`, [docIds]);
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
        let summaryShort = null;
        if (track === "medical") {
            const medical = ef.medicalRecord;
            const recProvider = rec?.provider_name ?? null;
            const recFacility = rec?.facility_name ?? null;
            if (medical) {
                const facilityText = medical.facility ?? recFacility;
                const providerText = medical.provider ?? recProvider;
                provider = providerText || facilityText || null;
                diagnosis = medical.diagnosis ?? null;
                procedure = medical.procedure ?? null;
                const matchedId = matchProviderText(providers, providerText) ??
                    matchProviderText(providers, facilityText) ??
                    matchProviderText(providers, recProvider) ??
                    matchProviderText(providers, recFacility);
                if (matchedId)
                    facilityId = matchedId;
            }
            else {
                provider = recProvider || recFacility || null;
                const matchedId = matchProviderText(providers, recProvider) ?? matchProviderText(providers, recFacility);
                if (matchedId)
                    facilityId = matchedId;
            }
            const sum = rec?.summary;
            if (sum && typeof sum === "object" && "summary" in sum && typeof sum.summary === "string") {
                summaryShort = (sum.summary || "").slice(0, 500);
            }
        }
        const metadata = track !== "medical" ? { docType } : {};
        if (summaryShort)
            metadata.summary = summaryShort;
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
                metadataJson: Object.keys(metadata).length > 0 ? metadata : undefined,
            },
        });
    }
    await prisma_1.prisma.caseTimelineRebuild.upsert({
        where: { caseId_firmId: { caseId, firmId } },
        create: { caseId, firmId, rebuiltAt: new Date() },
        update: { rebuiltAt: new Date() },
    });
    for (const doc of docs) {
        const rec = recByDoc.get(doc.id);
        const docType = rec?.doc_type ?? doc.extractedFields?.docType ?? null;
        await (0, billingExtraction_1.extractAndPersistBillingIfBill)(doc.id, caseId, firmId, docType).catch((e) => console.warn("[caseTimeline] billing extraction failed for", doc.id, e));
    }
    const legalCase = await prisma_1.prisma.legalCase.findFirst({
        where: { id: caseId, firmId },
        select: { title: true, caseNumber: true },
    });
    const caseLabel = legalCase?.title ?? legalCase?.caseNumber ?? caseId;
    (0, notifications_1.createNotification)(firmId, "timeline_updated", "Timeline updated", `Case timeline was rebuilt: ${caseLabel}`, { caseId }).catch((e) => console.warn("[notifications] timeline_updated failed", e));
}
