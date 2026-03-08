"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCourtFields = extractCourtFields;
/**
 * Extract court document fields from court filing text using OpenAI.
 * Only extract values explicitly present in text; otherwise null.
 * Stored in document_recognition.court_fields with shape:
 * { courtName, caseNumber, judge, filingDate, parties }
 * Gated by court_extraction feature.
 */
const openai_1 = __importDefault(require("openai"));
const SYSTEM_PROMPT = `You extract structured fields from court documents (filings, orders, notices, complaints, motions). Rules:
- Extract ONLY values that are explicitly stated in the document text. Do not infer or invent any value.
- If a field is not clearly present, return null for that field.

- courtName: full name of the court (e.g. "Superior Court of California, County of Los Angeles", "District Court for the Northern District of Texas"). Null if not stated.
- caseNumber: case number, docket number, or file number as stated (e.g. "CV 24-12345", "Case No. 2:24-cv-00123"). Null if not stated.
- judge: name of the judge or magistrate (e.g. "Hon. Jane Smith", "Judge John Doe"). Null if not stated.
- filingDate: the filing date as literally stated (e.g. "March 15, 2024", "03/15/2024"). Do not normalize format. Null if not stated.
- parties: plaintiff(s) and defendant(s) as stated, in one string (e.g. "Plaintiff: John Doe; Defendant: ABC Corp." or "Doe v. ABC Corp."). Keep concise. Null if not stated.

Return valid JSON only, with keys: courtName, caseNumber, judge, filingDate, parties.`;
async function extractCourtFields(args) {
    const { text, fileName } = args;
    const apiKey = process.env.OPENAI_API_KEY;
    const result = {
        courtName: null,
        caseNumber: null,
        judge: null,
        filingDate: null,
        parties: null,
    };
    if (!apiKey) {
        return result;
    }
    const truncated = text.length > 28000 ? text.slice(0, 28000) + "\n\n[Text truncated...]" : text;
    const userContent = `Extract the following fields from this court document. Return valid JSON only, no markdown or explanation.
${fileName ? `Filename: ${fileName}\n\n` : ""}
Document text:\n${truncated}`;
    const openai = new openai_1.default({ apiKey });
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userContent },
            ],
            max_tokens: 600,
            temperature: 0.1,
        });
        const raw = completion.choices?.[0]?.message?.content?.trim();
        if (!raw)
            return result;
        const parsed = JSON.parse(raw);
        if (typeof parsed.courtName === "string" && parsed.courtName.trim()) {
            result.courtName = parsed.courtName.trim().slice(0, 200);
        }
        if (typeof parsed.caseNumber === "string" && parsed.caseNumber.trim()) {
            result.caseNumber = parsed.caseNumber.trim().slice(0, 80);
        }
        if (typeof parsed.judge === "string" && parsed.judge.trim()) {
            result.judge = parsed.judge.trim().slice(0, 120);
        }
        if (typeof parsed.filingDate === "string" && parsed.filingDate.trim()) {
            result.filingDate = parsed.filingDate.trim().slice(0, 40);
        }
        if (typeof parsed.parties === "string" && parsed.parties.trim()) {
            result.parties = parsed.parties.trim().slice(0, 500);
        }
    }
    catch {
        // On error, return defaults (no warnings stored for court_fields)
    }
    return result;
}
