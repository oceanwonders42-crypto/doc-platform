/**
 * Builds case summary narrative from case data: timeline, providers, offers.
 * Used to persist CaseSummary and return structured summary for API.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";

export type CaseSummarySections = {
  conciseNarrative: string;
  injuries: string[];
  providersInvolved: string[];
  treatmentTimelineSummary: string;
  latestOffer: { amount: number; date: string; source?: string } | null;
};

export type CaseSummaryResult = {
  body: string;
  sections: CaseSummarySections;
};

function formatDate(d: Date | null): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export async function generateCaseSummary(caseId: string, firmId: string): Promise<CaseSummaryResult> {
  const [legalCase, timelineEvents, caseProviders, offersRows] = await Promise.all([
    prisma.legalCase.findFirst({
      where: { id: caseId, firmId },
      select: { id: true, title: true, caseNumber: true, clientName: true, createdAt: true },
    }),
    prisma.caseTimelineEvent.findMany({
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
    prisma.caseProvider.findMany({
      where: { caseId, firmId },
      include: { provider: { select: { name: true, specialty: true, city: true, state: true } } },
      orderBy: { createdAt: "asc" },
    }),
    pgPool.query<{ amount: number; date: Date; original_name: string }>(
      `select (dr.insurance_fields->>'settlementOffer')::float as amount,
              coalesce(d."processedAt", d."createdAt") as date,
              d."originalName" as original_name
       from "Document" d
       join document_recognition dr on dr.document_id = d.id
       where d."firmId" = $1 and d."routedCaseId" = $2
         and dr.insurance_fields is not null
         and (dr.insurance_fields->>'settlementOffer') is not null
         and (dr.insurance_fields->>'settlementOffer')::float > 0
       order by coalesce(d."processedAt", d."createdAt") desc
       limit 1`,
      [firmId, caseId]
    ),
  ]);

  if (!legalCase) throw new Error("Case not found");

  const injuries: string[] = [];
  const seenDiag = new Set<string>();
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
    if (p?.specialty) parts.push(p.specialty);
    if (p?.city || p?.state) parts.push([p?.city, p?.state].filter(Boolean).join(", "));
    return parts.join(" — ");
  });

  const timelineLines: string[] = [];
  timelineEvents.forEach((e) => {
    const dateStr = formatDate(e.eventDate);
    const type = e.eventType || e.track || "Event";
    const provider = e.provider ? ` (${e.provider})` : "";
    const detail = [e.diagnosis, e.procedure, e.amount].filter(Boolean).join(" · ");
    timelineLines.push(`${dateStr}: ${type}${provider}${detail ? " — " + detail : ""}`);
  });
  const treatmentTimelineSummary =
    timelineLines.length > 0 ? timelineLines.join("\n") : "No treatment timeline events recorded yet.";

  const latestOffer =
    offersRows.rows.length > 0
      ? {
          amount: Number(offersRows.rows[0].amount),
          date: (offersRows.rows[0].date && formatDate(offersRows.rows[0].date)) || "",
          source: offersRows.rows[0].original_name || undefined,
        }
      : null;

  const caseLabel = [legalCase.clientName, legalCase.caseNumber, legalCase.title].filter(Boolean).join(" · ") || "Case";
  const conciseNarrative =
    `${caseLabel}. ` +
    (injuries.length > 0 ? `Injuries/conditions: ${injuries.join("; ")}. ` : "") +
    (providersInvolved.length > 0
      ? `Providers involved: ${caseProviders.map((cp) => cp.provider?.name).filter(Boolean).join(", ")}. `
      : "") +
    (latestOffer ? `Latest settlement offer: $${latestOffer.amount.toLocaleString()}${latestOffer.date ? " (" + latestOffer.date + ")" : ""}.` : "No settlement offer on file.");

  const bodyParts: string[] = [];
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
  } else {
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
