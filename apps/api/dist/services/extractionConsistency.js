"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runConsistencyChecks = runConsistencyChecks;
function runConsistencyChecks(input) {
    const conflicts = [];
    const candidates = {};
    if (!input.pageCandidates || input.pageCandidates.length < 2) {
        return { conflicts, candidates };
    }
    const names = new Set();
    const dates = new Set();
    for (const p of input.pageCandidates) {
        if (p.clientName && String(p.clientName).trim())
            names.add(String(p.clientName).trim().toLowerCase());
        if (p.incidentDate && String(p.incidentDate).trim())
            dates.add(String(p.incidentDate).trim());
    }
    if (names.size > 1) {
        conflicts.push("Client/patient name differs across pages");
        candidates.clientName = Array.from(names);
    }
    if (dates.size > 1) {
        conflicts.push("Incident/visit date differs across pages");
        candidates.incidentDate = Array.from(dates);
    }
    const loweredConfidence = conflicts.length > 0 ? 0.5 : undefined;
    return {
        loweredConfidence,
        conflicts,
        candidates: Object.keys(candidates).length ? candidates : undefined,
    };
}
