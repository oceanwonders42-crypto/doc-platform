"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreDocumentRouting = scoreDocumentRouting;
exports.getExtractedForRouting = getExtractedForRouting;
exports.saveRoutingScoreSnapshot = saveRoutingScoreSnapshot;
/**
 * Document routing scorer: combines case match, patterns, and feedback for explainable routing.
 * Deterministic first (case number / client name), then pattern rules, then feedback boosts.
 */
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
const caseMatching_1 = require("./caseMatching");
function normalize(s) {
    if (s == null)
        return "";
    return String(s).trim().toLowerCase();
}
/** Simple filename pattern: supports * wildcard or includes substring. */
function fileNameMatches(pattern, fileName) {
    if (!pattern || !fileName)
        return false;
    const p = normalize(pattern);
    const f = normalize(fileName);
    if (p.includes("*")) {
        const regex = new RegExp("^" + p.replace(/\*/g, ".*") + "$");
        return regex.test(f);
    }
    return f.includes(p) || p.includes(f);
}
/** Check if doc type matches (pattern can be prefix, e.g. "insurance" matches "insurance_letter"). */
function docTypeMatches(patternDocType, docType) {
    if (!patternDocType || !docType)
        return false;
    const p = normalize(patternDocType);
    const d = normalize(docType);
    return d === p || d.startsWith(p + "_") || p.startsWith(d + "_");
}
async function scoreDocumentRouting(document, extracted, ocrText) {
    const { id: documentId, firmId, originalName, source, routedCaseId, status } = document;
    const signals = {
        caseNumber: extracted.caseNumber ?? null,
        clientName: extracted.clientName ?? null,
        docType: extracted.docType ?? null,
        fileName: originalName,
        source,
        baseMatchReason: null,
        providerName: extracted.providerName ?? null,
        providerMatchReasons: [],
    };
    const candidates = [];
    const matchedPatterns = [];
    // 1) Base case match (deterministic)
    const baseSignals = {
        caseNumber: extracted.caseNumber,
        clientName: extracted.clientName,
    };
    const baseMatch = await (0, caseMatching_1.matchDocumentToCase)(firmId, baseSignals, routedCaseId);
    signals.baseMatchReason = baseMatch.matchReason;
    if (baseMatch.caseId && baseMatch.matchConfidence > 0) {
        candidates.push({
            caseId: baseMatch.caseId,
            caseNumber: baseMatch.caseNumber,
            caseTitle: baseMatch.caseTitle,
            confidence: baseMatch.matchConfidence,
            reason: baseMatch.matchReason,
            source: "case_match",
        });
    }
    // 2) Active routing patterns (higher priority first)
    const patterns = await prisma_1.prisma.routingPattern.findMany({
        where: { firmId, active: true },
        orderBy: { priority: "asc" },
    });
    const ocrLower = (ocrText ?? "").toLowerCase();
    const fileName = originalName ?? "";
    for (const p of patterns) {
        let matches = true;
        if (p.docType && !docTypeMatches(p.docType, extracted.docType ?? null))
            matches = false;
        if (p.providerName && extracted.providerName) {
            if (!normalize(extracted.providerName).includes(normalize(p.providerName)))
                matches = false;
        }
        else if (p.providerName && !ocrLower.includes(normalize(p.providerName)))
            matches = false;
        if (p.source && source !== p.source)
            matches = false;
        if (p.fileNamePattern && !fileNameMatches(p.fileNamePattern, fileName))
            matches = false;
        if (p.keywordsJson && Array.isArray(p.keywordsJson)) {
            const keywords = p.keywordsJson;
            const hasAll = keywords.every((k) => ocrLower.includes(normalize(k)));
            if (!hasAll)
                matches = false;
        }
        if (!matches || !p.targetCaseId)
            continue;
        const caseRow = await prisma_1.prisma.legalCase.findFirst({
            where: { id: p.targetCaseId, firmId },
            select: { id: true, caseNumber: true, title: true, clientName: true },
        });
        if (!caseRow)
            continue;
        const patternConfidence = 0.7 + (100 - Math.min(p.priority, 100)) / 500;
        matchedPatterns.push({
            id: p.id,
            name: p.name,
            docType: p.docType,
            providerName: p.providerName,
            fileNamePattern: p.fileNamePattern,
            targetCaseId: p.targetCaseId,
            priority: p.priority,
            scoreContribution: patternConfidence,
        });
        const existing = candidates.find((c) => c.caseId === caseRow.id);
        if (existing) {
            existing.confidence = Math.min(0.98, existing.confidence + 0.1);
            existing.reason = `${existing.reason}; pattern "${p.name}"`;
        }
        else {
            candidates.push({
                caseId: caseRow.id,
                caseNumber: caseRow.caseNumber,
                caseTitle: caseRow.title,
                confidence: patternConfidence,
                reason: `Pattern: ${p.name}`,
                source: "pattern",
                patternId: p.id,
                patternName: p.name,
            });
        }
    }
    // 3) Historical feedback boost: same provider->case or similar filename->case (simplified)
    const recentFeedback = await prisma_1.prisma.routingFeedback.findMany({
        where: { firmId, wasAccepted: true },
        take: 200,
        orderBy: { createdAt: "desc" },
    });
    for (const fb of recentFeedback) {
        if (!fb.finalCaseId || fb.documentId === documentId)
            continue;
        const feats = fb.featuresJson;
        if (!feats)
            continue;
        let boost = 0;
        if (feats.fileName && fileNameMatches(feats.fileName, fileName))
            boost += 0.15;
        if (feats.docType && feats.docType === (extracted.docType ?? ""))
            boost += 0.1;
        if (feats.providerName && extracted.providerName && normalize(feats.providerName) === normalize(extracted.providerName))
            boost += 0.2;
        if (boost <= 0)
            continue;
        const existing = candidates.find((c) => c.caseId === fb.finalCaseId);
        if (existing)
            existing.confidence = Math.min(0.98, existing.confidence + boost);
        else {
            const caseRow = await prisma_1.prisma.legalCase.findFirst({
                where: { id: fb.finalCaseId, firmId },
                select: { id: true, caseNumber: true, title: true },
            });
            if (caseRow)
                candidates.push({
                    caseId: caseRow.id,
                    caseNumber: caseRow.caseNumber,
                    caseTitle: caseRow.title,
                    confidence: 0.5 + boost,
                    reason: "Similar to previously accepted routing",
                    source: "feedback",
                });
        }
    }
    // 4) Provider-aware boosts: CaseProvider link, timeline provider
    const providerText = (extracted.providerName ?? "").trim();
    if (providerText.length >= 2) {
        const providerNorm = normalize(providerText);
        const caseProviders = await prisma_1.prisma.caseProvider.findMany({
            where: { firmId },
            include: { provider: { select: { id: true, name: true } }, case: { select: { id: true, caseNumber: true, title: true } } },
        });
        const caseProviderMatch = caseProviders.find((cp) => cp.provider.name &&
            (normalize(cp.provider.name).includes(providerNorm) || providerNorm.includes(normalize(cp.provider.name))));
        if (caseProviderMatch) {
            const boost = 0.25;
            if (signals.providerMatchReasons)
                signals.providerMatchReasons.push(`Provider "${caseProviderMatch.provider.name}" linked to case`);
            const existing = candidates.find((c) => c.caseId === caseProviderMatch.caseId);
            if (existing) {
                existing.confidence = Math.min(0.98, existing.confidence + boost);
                existing.reason = `${existing.reason}; provider linked to case`;
            }
            else {
                candidates.push({
                    caseId: caseProviderMatch.caseId,
                    caseNumber: caseProviderMatch.case.caseNumber,
                    caseTitle: caseProviderMatch.case.title,
                    confidence: 0.6 + boost,
                    reason: `Provider "${caseProviderMatch.provider.name}" linked to case`,
                    source: "case_match",
                });
            }
        }
        const timelineEvents = await prisma_1.prisma.caseTimelineEvent.findMany({
            where: { firmId },
            select: { caseId: true, provider: true },
            orderBy: { createdAt: "desc" },
            take: 500,
        });
        for (const te of timelineEvents) {
            if (!te.provider)
                continue;
            const pNorm = normalize(te.provider);
            if (!pNorm.includes(providerNorm) && !providerNorm.includes(pNorm))
                continue;
            const existing = candidates.find((c) => c.caseId === te.caseId);
            const boost = 0.15;
            if (existing)
                existing.confidence = Math.min(0.98, existing.confidence + boost);
            else {
                const caseRow = await prisma_1.prisma.legalCase.findFirst({
                    where: { id: te.caseId, firmId },
                    select: { id: true, caseNumber: true, title: true },
                });
                if (caseRow)
                    candidates.push({
                        caseId: caseRow.id,
                        caseNumber: caseRow.caseNumber,
                        caseTitle: caseRow.title,
                        confidence: 0.5 + boost,
                        reason: "Provider appears in case timeline",
                        source: "feedback",
                    });
            }
            if (signals.providerMatchReasons)
                signals.providerMatchReasons.push("Provider appears in case timeline");
            break;
        }
    }
    // Pick best candidate
    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0] ?? null;
    const chosenCaseId = best?.caseId ?? null;
    const confidence = best?.confidence ?? 0;
    // chosenFolder: not in schema; could be a tag or null
    const chosenFolder = null;
    const chosenDocType = extracted.docType ?? null;
    return {
        chosenCaseId,
        chosenFolder,
        chosenDocType,
        confidence,
        candidates,
        matchedPatterns,
        signals,
    };
}
/** Load extracted fields from document_recognition for a document. */
async function getExtractedForRouting(documentId) {
    const { rows } = await pg_1.pgPool.query(`select case_number, client_name, doc_type, provider_name from document_recognition where document_id = $1`, [documentId]);
    const r = rows[0];
    if (!r)
        return null;
    return {
        caseNumber: r.case_number,
        clientName: r.client_name,
        docType: r.doc_type,
        providerName: r.provider_name ?? null,
    };
}
/** Save a routing score snapshot for explainability. */
async function saveRoutingScoreSnapshot(firmId, documentId, result) {
    await prisma_1.prisma.routingScoreSnapshot.create({
        data: {
            firmId,
            documentId,
            chosenCaseId: result.chosenCaseId,
            chosenFolder: result.chosenFolder,
            chosenDocType: result.chosenDocType,
            confidence: result.confidence,
            signalsJson: result.signals,
            candidatesJson: result.candidates,
        },
    });
}
