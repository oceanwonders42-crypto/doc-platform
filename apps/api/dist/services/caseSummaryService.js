"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCaseSummary = generateCaseSummary;
/**
 * Builds case summary narrative from case data: timeline, providers, offers.
 * Used to persist CaseSummary and return structured summary for API.
 */
const prisma_1 = require("../db/prisma");
const pg_1 = require("../db/pg");
function formatDate(d) {
    if (!d)
        return "";
    try {
        return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    }
    catch {
        return "";
    }
}
async function generateCaseSummary(caseId, firmId) {
    const [legalCase, timelineEvents, caseProviders, offersRows] = await Promise.all([
        prisma_1.prisma.legalCase.findFirst({
            where: { id: caseId, firmId },
            select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true },
        }),
        prisma_1.prisma.caseTimelineEvent.findMany({
            where: { caseId, firmId },
            orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
            select: {
                eventDate: true,
                eventType: true,
                track: true,
                provider: true,
                diagnosis: true,
                procedure: true,
                amount: true,
            },
        }),
        prisma_1.prisma.caseProvider.findMany({
            where: { caseId, firmId },
            include: { provider: { select: { name: true, specialty: true, city: true, state: true } } },
            orderBy: { createdAt: "asc" },
        }),
        pg_1.pgPool.query(`select (dr.insurance_fields->>'settlementOffer')::float as amount,
              coalesce(d.processed_at, d.created_at) as date,
              d.original_name
       from "Document" d
       join document_recognition dr on dr.document_id = d.id
       where d.firm_id = $1 and d.routed_case_id = $2
         and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null
         and (dr.insurance_fields->>'settlementOffer')::float > 0
       order by coalesce(d.processed_at, d.created_at) desc
       limit 1`, [firmId, caseId]),
    ]);
    if (!legalCase)
        throw new Error("Case not found");
    const injuries = [];
    const seenDiag = new Set();
    timelineEvents.forEach((e) => {
        if (e.diagnosis && e.diagnosis.trim() && !seenDiag.has(e.diagnosis.trim())) {
            seenDiag.add(e.diagnosis.trim());
            injuries.push(e.diagnosis.trim());
        }
    });
    const providersInvolved = caseProviders.map((cp) => {
        const p = cp.provider;
        const name = p?.name ?? "Provider";
        const parts = [name];
        if (p?.specialty)
            parts.push(p.specialty);
        if (p?.city || p?.state)
            parts.push([p?.city, p?.state].filter(Boolean).join(", "));
        return parts.join(" — ");
    });
    const timelineLines = [];
    timelineEvents.forEach((e) => {
        const dateStr = formatDate(e.eventDate);
        const type = e.eventType || e.track || "Event";
        const provider = e.provider ? ` (${e.provider})` : "";
        const detail = [e.diagnosis, e.procedure, e.amount].filter(Boolean).join(" · ");
        timelineLines.push(`${dateStr}: ${type}${provider}${detail ? " — " + detail : ""}`);
    });
    const treatmentTimelineSummary = timelineLines.length > 0 ? timelineLines.join("\n") : "No treatment timeline events recorded yet.";
    const latestOffer = offersRows.rows.length > 0
        ? {
            amount: Number(offersRows.rows[0].amount),
            date: (offersRows.rows[0].date && formatDate(offersRows.rows[0].date)) || "",
            source: offersRows.rows[0].original_name || undefined,
        }
        : null;
    const caseLabel = [legalCase.clientName, legalCase.caseNumber, legalCase.title].filter(Boolean).join(" · ") || "Case";
    const conciseNarrative = `${caseLabel}. ` +
        (injuries.length > 0 ? `Injuries/conditions: ${injuries.join("; ")}. ` : "") +
        (providersInvolved.length > 0
            ? `Providers involved: ${caseProviders.map((cp) => cp.provider?.name).filter(Boolean).join(", ")}. `
            : "") +
        (latestOffer ? `Latest settlement offer: $${latestOffer.amount.toLocaleString()}${latestOffer.date ? " (" + latestOffer.date + ")" : ""}.` : "No settlement offer on file.");
    const bodyParts = [];
    bodyParts.push("SUMMARY");
    bodyParts.push("");
    bodyParts.push(conciseNarrative);
    bodyParts.push("");
    bodyParts.push("INJURIES / CONDITIONS");
    bodyParts.push(injuries.length > 0 ? injuries.join("\n") : "None documented.");
    bodyParts.push("");
    bodyParts.push("PROVIDERS INVOLVED");
    bodyParts.push(providersInvolved.length > 0 ? providersInvolved.join("\n") : "None linked.");
    bodyParts.push("");
    bodyParts.push("TREATMENT TIMELINE SUMMARY");
    bodyParts.push(treatmentTimelineSummary);
    bodyParts.push("");
    bodyParts.push("LATEST OFFER");
    if (latestOffer) {
        bodyParts.push(`$${latestOffer.amount.toLocaleString()}${latestOffer.date ? " — " + latestOffer.date : ""}${latestOffer.source ? " (" + latestOffer.source + ")" : ""}`);
    }
    else {
        bodyParts.push("None on file.");
    }
    const body = bodyParts.join("\n");
    return {
        body,
        sections: {
            conciseNarrative,
            injuries,
            providersInvolved,
            treatmentTimelineSummary,
            latestOffer,
        },
    };
}
