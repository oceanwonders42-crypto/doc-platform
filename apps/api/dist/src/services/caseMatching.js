"use strict";
/**
 * Case matching: match a document (recognition result) to a firm Case.
 * Returns matchConfidence and matchReason for worker and UI.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchDocumentToCase = matchDocumentToCase;
const prisma_1 = require("../db/prisma");
function normalize(s) {
    if (s == null)
        return "";
    return String(s).trim().toLowerCase();
}
async function matchDocumentToCase(firmId, signals, existingRoutedCaseId) {
    // 4. Existing routedCaseId — already assigned
    if (existingRoutedCaseId) {
        const c = await prisma_1.prisma.case.findFirst({
            where: { id: existingRoutedCaseId, firmId },
            include: { client: true },
        });
        if (c) {
            return {
                caseId: c.id,
                caseNumber: c.caseNumber,
                caseTitle: c.title,
                matchConfidence: 1,
                matchReason: "Already routed to this case",
            };
        }
    }
    const caseNum = normalize(signals.caseNumber);
    const clientName = normalize(signals.clientName);
    // 1. caseNumber (best signal)
    if (caseNum.length >= 2) {
        const byNumber = await prisma_1.prisma.case.findFirst({
            where: {
                firmId,
                caseNumber: { equals: signals.caseNumber?.trim(), mode: "insensitive" },
            },
            include: { client: true },
        });
        if (byNumber) {
            return {
                caseId: byNumber.id,
                caseNumber: byNumber.caseNumber,
                caseTitle: byNumber.title,
                matchConfidence: 0.95,
                matchReason: "Case number match",
            };
        }
        // Partial case number match (contains)
        const partial = await prisma_1.prisma.case.findMany({
            where: {
                firmId,
                caseNumber: { contains: signals.caseNumber ?? "", mode: "insensitive" },
            },
            include: { client: true },
            take: 1,
        });
        if (partial[0]) {
            return {
                caseId: partial[0].id,
                caseNumber: partial[0].caseNumber,
                caseTitle: partial[0].title,
                matchConfidence: 0.8,
                matchReason: "Partial case number match",
            };
        }
    }
    // 2. clientName + existing client records
    if (clientName.length >= 2) {
        const clients = await prisma_1.prisma.client.findMany({
            where: {
                firmId,
                name: { contains: signals.clientName ?? "", mode: "insensitive" },
            },
            include: { cases: { take: 5 } },
        });
        for (const client of clients) {
            const c = client.cases[0];
            if (c) {
                const nameMatch = client.name.toLowerCase().includes(clientName) || clientName.includes(client.name.toLowerCase());
                const confidence = nameMatch ? 0.75 : 0.6;
                return {
                    caseId: c.id,
                    caseNumber: c.caseNumber,
                    caseTitle: c.title,
                    matchConfidence: confidence,
                    matchReason: `Client name match: ${client.name}`,
                };
            }
        }
    }
    return {
        caseId: null,
        caseNumber: null,
        caseTitle: null,
        matchConfidence: 0,
        matchReason: "No matching case found",
    };
}
