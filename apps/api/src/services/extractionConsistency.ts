/**
 * Consistency checks across pages / extracted values.
 * Compare patient name, DOB, provider across pages; detect conflicts; lower confidence when inconsistent.
 */
export type ConsistencyInput = {
  clientName?: string | null;
  incidentDate?: string | null;
  caseNumber?: string | null;
  pageCandidates?: { clientName?: string | null; incidentDate?: string | null }[];
};

export type ConsistencyResult = {
  loweredConfidence?: number;
  conflicts: string[];
  candidates?: Record<string, unknown[]>;
};

export function runConsistencyChecks(input: ConsistencyInput): ConsistencyResult {
  const conflicts: string[] = [];
  const candidates: Record<string, unknown[]> = {};

  if (!input.pageCandidates || input.pageCandidates.length < 2) {
    return { conflicts, candidates };
  }

  const names = new Set<string>();
  const dates = new Set<string>();
  for (const p of input.pageCandidates) {
    if (p.clientName && String(p.clientName).trim()) names.add(String(p.clientName).trim().toLowerCase());
    if (p.incidentDate && String(p.incidentDate).trim()) dates.add(String(p.incidentDate).trim());
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
