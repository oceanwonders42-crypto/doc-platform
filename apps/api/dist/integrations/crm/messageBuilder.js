"use strict";
/**
 * Builds the "Case Intelligence Update" message body (Markdown) for CRM push.
 * No DB access—caller supplies all data. Kept concise (~250 lines max). No invented facts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCaseIntelligenceMessage = buildCaseIntelligenceMessage;
const ACTION_LABELS = {
    document_routed: "Document routed to case",
    document_approved: "Document approved for case",
    narrative_generated: "Narrative generated",
    timeline_rebuilt: "Case timeline rebuilt",
};
function buildCaseIntelligenceMessage(params) {
    const { caseId, actionType, documentId, documentFileName, summary, keyFacts = [], matchReason, confidence, docType, risks = [], insights = [], timelineSummary, narrativeExcerpt, sourceDocuments = [], } = params;
    const title = "Case Intelligence Update";
    const lines = [];
    lines.push(`**Trigger:** ${ACTION_LABELS[actionType]}`);
    lines.push(`**Case ID:** ${caseId}`);
    if (documentId) {
        lines.push(`**Document:** ${documentFileName ?? documentId} (\`${documentId}\`)`);
    }
    lines.push("");
    // Summary
    lines.push("## Summary");
    if (summary && summary.trim()) {
        lines.push(summary.trim());
    }
    else {
        lines.push("*No summary available.*");
    }
    lines.push("");
    // Key facts
    lines.push("## Key facts");
    if (keyFacts.length > 0) {
        keyFacts.forEach((f) => lines.push(`- ${f}`));
    }
    else {
        lines.push("*None extracted.*");
    }
    lines.push("");
    // Match / routing
    if (actionType === "document_routed" || actionType === "document_approved") {
        lines.push("## Routing");
        if (confidence != null) {
            lines.push(`- Confidence: ${Math.round(confidence * 100)}%`);
        }
        if (matchReason && matchReason.trim()) {
            lines.push(`- Reason: ${matchReason.trim()}`);
        }
        if (docType && docType.trim()) {
            lines.push(`- Document type: ${docType.trim()}`);
        }
        lines.push("");
    }
    // Timeline
    lines.push("## Timeline updates");
    if (timelineSummary && timelineSummary.trim()) {
        lines.push(timelineSummary.trim());
    }
    else {
        lines.push("*No timeline summary in this update.*");
    }
    lines.push("");
    // Risks / flags
    lines.push("## Risks / flags");
    if (risks.length > 0) {
        risks.forEach((r) => {
            const label = r.type.replace(/_/g, " ");
            lines.push(`- **${label}**${r.severity ? ` (${r.severity})` : ""}`);
        });
    }
    else {
        lines.push("*None identified.*");
    }
    lines.push("");
    // Insights
    lines.push("## Insights");
    if (insights.length > 0) {
        insights.forEach((i) => {
            const label = i.type.replace(/_/g, " ");
            lines.push(`- **${label}**${i.severity ? ` (${i.severity})` : ""}`);
        });
    }
    else {
        lines.push("*None.*");
    }
    lines.push("");
    // Narrative excerpt (when action is narrative_generated)
    if (actionType === "narrative_generated" && narrativeExcerpt && narrativeExcerpt.trim()) {
        lines.push("## Narrative excerpt");
        lines.push(narrativeExcerpt.trim().slice(0, 2000));
        if (narrativeExcerpt.length > 2000)
            lines.push("…");
        lines.push("");
    }
    // Suggested follow-ups (placeholder)
    lines.push("## Suggested follow-ups");
    lines.push("*Review routed documents; update matter notes as needed.*");
    lines.push("");
    // Source documents
    lines.push("## Source documents");
    if (sourceDocuments.length > 0) {
        sourceDocuments.forEach((d) => {
            lines.push(`- ${d.fileName ?? d.id} (\`${d.id}\`)`);
        });
    }
    else if (documentId) {
        lines.push(`- ${documentFileName ?? documentId} (\`${documentId}\`)`);
    }
    else {
        lines.push("*None in this update.*");
    }
    const bodyMarkdown = lines.join("\n").slice(0, 15000);
    return { title, bodyMarkdown };
}
