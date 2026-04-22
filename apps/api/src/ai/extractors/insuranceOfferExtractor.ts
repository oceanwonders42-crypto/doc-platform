/**
 * Extract insurance offer fields from insurance letter text using OpenAI.
 * Only extract values explicitly present in text; otherwise null.
 * Stored in document_recognition.insurance_fields with shape:
 * { settlementOffer, policyLimits, claimNumber, adjusterName, insuranceCompany, warnings }
 */
import OpenAI from "openai";

import { OPENAI_TASK_TYPES, runOpenAiChatCompletionWithTelemetry } from "../../services/aiTaskTelemetry";
import { getStoredTextHash } from "../../services/documentRecognitionCache";

export type InsuranceOfferFields = {
  insuranceCompany: string | null;
  adjusterName: string | null;
  claimNumber: string | null;
  settlementOffer: number | null; // dollars, e.g. 12500
  policyLimits: string | null; // raw text e.g. "$10,000/$20,000" or "$100,000 BI"
  warnings?: string[];
};

const SYSTEM_PROMPT = `You extract structured fields from insurance or adjuster letters. Rules:
- Extract ONLY values that are explicitly stated in the document text. Do not infer or invent any value.
- If a field is not clearly present, return null for that field.

- insuranceCompany: full name of the insurer/carrier (e.g. "State Farm", "Allstate"). Null if not stated.
- adjusterName: name of the adjuster or claims representative. Null if not stated.
- claimNumber: claim number, file number, or reference number. Null if not stated.

- settlementOffer: the settlement OFFER amount in dollars as a number (e.g. 12500). Important:
  * The document may contain multiple dollar amounts (policy limits, medical bills, demand amounts, offer amount).
  * Identify which amount is explicitly the settlement/offer (look for phrases like "we offer", "settlement offer", "in the amount of", "offer of", "propose to settle for", "accept in the amount of").
  * Do NOT use policy limits, demand amounts, or "limits" as the settlement offer. Use only the amount the carrier is offering to pay.
  * If you see a range (e.g. "$10,000 - $15,000"), use the amount that is clearly the offer; if the offer is expressed as a range, use the first or most explicit number and add a warning.
  * If multiple amounts could be the offer, choose the one most clearly labeled as the offer and add a warning listing the ambiguity.
  * Null if no settlement offer is stated.

- policyLimits: policy limits only, as literally stated (e.g. "$10,000/$20,000", "$100,000 BI", "25/50", "per person / per occurrence"). Do not include settlement offer amounts. Parse limits separately from other dollar amounts. Keep raw text. Null if not stated.

- warnings: array of short strings explaining ambiguity or choices, e.g.:
  * "Multiple dollar amounts found; used [amount] as settlement offer; others may be limits or demand."
  * "Settlement amount appeared in a range; used [value]."
  * "Could not distinguish policy limits from other amounts."
  * "Multiple possible offer amounts ($X, $Y); used $X based on context."
  Do not add warnings for simple missing optional fields.`;

export const INSURANCE_OFFER_PROMPT_VERSION = "insurance-offer-extractor-v1";
export const INSURANCE_OFFER_MODEL = "gpt-4o-mini";

type InsuranceOfferTelemetryContext = {
  firmId?: string | null;
  documentId?: string | null;
  caseId?: string | null;
  source?: string | null;
};

export async function extractInsuranceOfferFields(args: {
  text: string;
  fileName?: string;
  telemetryContext?: InsuranceOfferTelemetryContext;
}): Promise<InsuranceOfferFields> {
  const { text, fileName, telemetryContext } = args;
  const apiKey = process.env.OPENAI_API_KEY;
  const warnings: string[] = [];

  const result: InsuranceOfferFields = {
    insuranceCompany: null,
    adjusterName: null,
    claimNumber: null,
    settlementOffer: null,
    policyLimits: null,
  };

  if (!apiKey) {
    result.warnings = ["OPENAI_API_KEY not set; extraction skipped."];
    return result;
  }

  const truncated = text.length > 28000 ? text.slice(0, 28000) + "\n\n[Text truncated...]" : text;

  const userContent = `Extract the following fields from this insurance/adjuster letter. Return valid JSON only, no markdown or explanation.
${fileName ? `Filename: ${fileName}\n\n` : ""}
Document text:\n${truncated}`;

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await runOpenAiChatCompletionWithTelemetry({
      openai,
      request: {
        model: INSURANCE_OFFER_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      },
      telemetry: {
        firmId: telemetryContext?.firmId ?? null,
        documentId: telemetryContext?.documentId ?? null,
        caseId: telemetryContext?.caseId ?? null,
        source: telemetryContext?.source ?? "insuranceOfferExtractor",
        taskType: OPENAI_TASK_TYPES.insuranceExtraction,
        model: INSURANCE_OFFER_MODEL,
        promptVersion: INSURANCE_OFFER_PROMPT_VERSION,
        inputHash: getStoredTextHash(text),
      },
    });

    const raw = completion.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      result.warnings = ["OpenAI returned empty response."];
      return result;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.insuranceCompany === "string" && parsed.insuranceCompany.trim()) {
      result.insuranceCompany = parsed.insuranceCompany.trim().slice(0, 200);
    }
    if (typeof parsed.adjusterName === "string" && parsed.adjusterName.trim()) {
      result.adjusterName = parsed.adjusterName.trim().slice(0, 120);
    }
    if (typeof parsed.claimNumber === "string" && parsed.claimNumber.trim()) {
      result.claimNumber = parsed.claimNumber.trim().slice(0, 80);
    }
    if (typeof parsed.settlementOffer === "number" && Number.isFinite(parsed.settlementOffer)) {
      result.settlementOffer = Math.round(parsed.settlementOffer);
    } else if (typeof parsed.settlementOffer === "string" && parsed.settlementOffer.trim()) {
      const num = parseFloat(parsed.settlementOffer.replace(/[,$\s]/g, ""));
      if (Number.isFinite(num)) result.settlementOffer = Math.round(num);
    }
    if (typeof parsed.policyLimits === "string" && parsed.policyLimits.trim()) {
      result.policyLimits = parsed.policyLimits.trim().slice(0, 200);
    }
    if (Array.isArray(parsed.warnings)) {
      for (const w of parsed.warnings) {
        if (typeof w === "string" && w.trim()) warnings.push(w.trim().slice(0, 300));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Extraction error: ${msg}`);
  }

  if (warnings.length) result.warnings = warnings;
  return result;
}
