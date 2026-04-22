/**
 * Demand Narrative Assistant: generate narrative text from case documents.
 *
 * Pipeline:
 * 1. Collect case documents (via timeline events and document extractedFields)
 * 2. Extract medical events (diagnoses, procedures, injuries from timeline + medicalRecord)
 * 3. Build prompt (timeline, insurance events, medical info, narrativeType, tone)
 * 4. Call OpenAI, return generated narrative text with optional warnings.
 */
import OpenAI from "openai";
import { prisma } from "../db/prisma";
import {
  computeAiInputHash,
  OPENAI_TASK_TYPES,
  runOpenAiChatCompletionWithTelemetry,
} from "../services/aiTaskTelemetry";

export type NarrativeType =
  | "treatment_summary"
  | "injury_summary"
  | "pain_suffering"
  | "liability"
  | "demand_rationale"
  | "response_to_denial"
  | "response_to_offer";

export type NarrativeTone = "neutral" | "assertive" | "aggressive";

export interface NarrativeInput {
  caseId: string;
  firmId: string;
  type: NarrativeType;
  tone: NarrativeTone;
  notes?: string;
  /** Questionnaire answers used only to enrich the prompt; not persisted */
  questionnaire?: {
    mainInjuries?: string | null;
    treatmentHighlights?: string | null;
    lostWagesYesNo?: boolean | null;
    lostWagesAmount?: string | null;
    currentDemandAmount?: string | null;
    keyLiabilityFacts?: string | null;
  };
}

export interface UsedEvent {
  eventDate: string | null;
  eventType: string | null;
  documentId: string;
}

export interface NarrativeResult {
  text: string;
  usedEvents: UsedEvent[];
  warnings?: string[];
}

export const NARRATIVE_PROMPT_VERSION = "case-narrative-v1";
export const NARRATIVE_MODEL = "gpt-4o-mini";

const TYPE_LABELS: Record<NarrativeType, string> = {
  treatment_summary: "Treatment summary",
  injury_summary: "Injury summary",
  pain_suffering: "Pain and suffering",
  liability: "Liability",
  demand_rationale: "Demand rationale",
  response_to_denial: "Response to denial",
  response_to_offer: "Response to offer",
};

const TONE_INSTRUCTIONS: Record<NarrativeTone, string> = {
  neutral: "Use a neutral, factual tone.",
  assertive: "Use an assertive, confident tone while remaining professional.",
  aggressive: "Use a firm, forceful tone; emphasize strength of position.",
};

function formatQuestionnaireBlock(
  q: NarrativeInput["questionnaire"]
): string {
  if (!q) return "";
  const lines: string[] = [];
  if (q.mainInjuries?.trim()) lines.push("Main injuries: " + q.mainInjuries.trim());
  if (q.treatmentHighlights?.trim()) lines.push("Treatment highlights: " + q.treatmentHighlights.trim());
  if (q.lostWagesYesNo === true) {
    const amt = q.lostWagesAmount?.trim() ? " (amount: " + q.lostWagesAmount.trim() + ")" : "";
    lines.push("Lost wages: Yes" + amt);
  } else if (q.lostWagesYesNo === false) {
    lines.push("Lost wages: No");
  }
  if (q.currentDemandAmount?.trim()) lines.push("Current demand amount: " + q.currentDemandAmount.trim());
  if (q.keyLiabilityFacts?.trim()) lines.push("Key liability facts: " + q.keyLiabilityFacts.trim());
  if (lines.length === 0) return "";
  return "\nDemand questionnaire (from user):\n" + lines.join("\n");
}

function formatEventDate(d: Date | null): string {
  if (!d) return "[no date]";
  const x = new Date(d);
  return isNaN(x.getTime()) ? "[invalid date]" : x.toISOString().slice(0, 10);
}

export async function generateNarrative(input: NarrativeInput): Promise<NarrativeResult> {
  const { caseId, firmId, type, tone, notes, questionnaire } = input;
  const warnings: string[] = [];

  const events = await prisma.caseTimelineEvent.findMany({
    where: { caseId, firmId },
    orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
  });

  const docIds = [...new Set(events.map((e) => e.documentId))];
  const docs =
    docIds.length > 0
      ? await prisma.document.findMany({
          where: { id: { in: docIds }, firmId },
          select: { id: true, extractedFields: true },
        })
      : [];
  const extractedByDoc = new Map(docs.map((d) => [d.id, (d.extractedFields as Record<string, unknown>) || {}]));

  const injuries: string[] = [];
  const diagnoses: string[] = [];
  const procedures: string[] = [];
  events.forEach((e) => {
    if (e.diagnosis && !diagnoses.includes(e.diagnosis)) diagnoses.push(e.diagnosis);
    if (e.procedure && !procedures.includes(e.procedure)) procedures.push(e.procedure);
  });
  docs.forEach((d) => {
    const ef = extractedByDoc.get(d.id) || {};
    const med = ef.medicalRecord as Record<string, unknown> | undefined;
    if (med && typeof med === "object") {
      const diag = med.diagnosis ?? med.diagnoses;
      if (diag) {
        const arr = Array.isArray(diag) ? diag : [diag];
        arr.forEach((x: unknown) => {
          const s = String(x).trim();
          if (s && !diagnoses.includes(s)) diagnoses.push(s);
        });
      }
      const proc = med.procedure ?? med.procedures;
      if (proc) {
        const arr = Array.isArray(proc) ? proc : [proc];
        arr.forEach((x: unknown) => {
          const s = String(x).trim();
          if (s && !procedures.includes(s)) procedures.push(s);
        });
      }
    }
    if (ef.injuries && Array.isArray(ef.injuries)) {
      (ef.injuries as string[]).forEach((s) => {
        const t = String(s).trim();
        if (t && !injuries.includes(t)) injuries.push(t);
      });
    }
  });

  const timelineLines = events.map((e) => {
    const date = formatEventDate(e.eventDate);
    const parts = [date, e.eventType || "Event", e.track];
    if (e.provider) parts.push("Provider: " + e.provider);
    if (e.diagnosis) parts.push("Dx: " + e.diagnosis);
    if (e.procedure) parts.push("Proc: " + e.procedure);
    if (e.amount) parts.push("Amount: " + e.amount);
    return "- " + parts.join(" | ") + " (doc: " + e.documentId + ")";
  });

  const insuranceEvents = events.filter((e) => e.track === "insurance");
  const insuranceLines = insuranceEvents.map((e) => {
    const date = formatEventDate(e.eventDate);
    const amt = e.amount ? " Amount: " + e.amount : "";
    return "- " + date + " " + (e.eventType || "Insurance") + amt + " (doc: " + e.documentId + ")";
  });

  if (events.length === 0) warnings.push("No timeline events found for this case; draft may be generic.");
  if (diagnoses.length === 0 && procedures.length === 0) warnings.push("No diagnoses or procedures in timeline; consider adding medical records.");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      text: "[Error: OPENAI_API_KEY is not set. Add it to apps/api/.env]",
      usedEvents: events.map((e) => ({ eventDate: e.eventDate?.toISOString() ?? null, eventType: e.eventType, documentId: e.documentId })),
      warnings: ["OPENAI_API_KEY not configured."],
    };
  }

  const openai = new OpenAI({ apiKey });

  const sectionTitle = TYPE_LABELS[type];
  const toneInstruction = TONE_INSTRUCTIONS[tone];

  const timelineBlock = timelineLines.length ? timelineLines.join("\n") : "[No timeline events provided]";
  const insuranceBlock = insuranceLines.length ? "## Insurance-related events\n" + insuranceLines.join("\n") : "";
  const diagnosesBlock = diagnoses.length ? diagnoses.join("; ") : "[None extracted - add placeholders if needed]";
  const proceduresBlock = procedures.length ? procedures.join("; ") : "[None extracted]";
  const injuriesBlock = injuries.length ? "Injuries: " + injuries.join("; ") : "";
  const notesBlock = notes ? "\nAdditional notes from the user: " + notes : "";

  const prompt =
    "You are helping draft narrative sections for a demand package. Output draft language only-no legal advice, no recommendations. Do not invent facts. Use only the case information provided below. If critical information is missing, use [BRACKETED PLACEHOLDERS] (e.g. [CLIENT NAME], [DATE OF INCIDENT], [INSURER NAME]).\n\n" +
    "Case identifier: " + caseId + "\n" +
    "Case number/title: Case " + caseId + "\n" +
    "Client: [CLIENT NAME - insert if known]\n\n" +
    "## Timeline events (date | type | track | details)\n" +
    timelineBlock + "\n\n" +
    (insuranceBlock ? insuranceBlock + "\n\n" : "") +
    "## Extracted medical information\n" +
    "Diagnoses: " + diagnosesBlock + "\n" +
    "Procedures: " + proceduresBlock + "\n" +
    injuriesBlock + (injuriesBlock ? "\n" : "") +
    "\n## Task\n" +
    "Write a **" + sectionTitle + "** section (2-4 short paragraphs) for a demand letter. " + toneInstruction + "\n" +
    notesBlock + "\n" +
    formatQuestionnaireBlock(questionnaire) + "\n\n" +
    "Output only the draft narrative text, no preamble or labels. Use [BRACKETS] for any missing specific facts.";

  try {
    const completion = await runOpenAiChatCompletionWithTelemetry({
      openai,
      request: {
        model: NARRATIVE_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.4,
      },
      telemetry: {
        firmId,
        caseId,
        source: "cases.narrative",
        taskType: OPENAI_TASK_TYPES.narrativeGeneration,
        taskVariant: `${type}:${tone}`,
        model: NARRATIVE_MODEL,
        promptVersion: NARRATIVE_PROMPT_VERSION,
        inputHash: computeAiInputHash(prompt),
      },
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ??
      "[No text generated. Try again or check OpenAI API.]";

    return {
      text,
      usedEvents: events.map((e) => ({
        eventDate: e.eventDate?.toISOString() ?? null,
        eventType: e.eventType,
        documentId: e.documentId,
      })),
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      text: "[Error generating narrative: " + message + "]",
      usedEvents: events.map((e) => ({
        eventDate: e.eventDate?.toISOString() ?? null,
        eventType: e.eventType,
        documentId: e.documentId,
      })),
      warnings: [...warnings, message],
    };
  }
}
