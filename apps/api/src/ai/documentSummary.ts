/**
 * Generate a short summary and key facts for a document.
 * Results are stored in document_recognition.summary.
 */

import OpenAI from "openai";

export type DocumentSummaryResult = {
  summary: string;
  keyFacts: string[];
};

const MAX_TEXT_LENGTH = 12000;

/**
 * Summarizes document text using an LLM. Returns a brief summary and a list of key facts.
 * If OPENAI_API_KEY is unset or the call fails, returns a fallback (excerpt as summary, empty keyFacts).
 */
export async function summarizeDocument(text: string): Promise<DocumentSummaryResult> {
  if (!text || typeof text !== "string") {
    return { summary: "", keyFacts: [] };
  }

  const truncated =
    text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) + "\n\n[Text truncated...]" : text;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackSummary(truncated);
  }

  try {
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Summarize the following document in 2-4 sentences. Then list 3-7 key facts as short bullet points.

Output valid JSON only, with this exact structure (no markdown, no code fence):
{"summary":"...","keyFacts":["fact1","fact2",...]}

Document text:

${truncated}`,
        },
      ],
      max_tokens: 600,
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallbackSummary(truncated);

    const parsed = parseSummaryResponse(raw);
    if (parsed) return parsed;

    return fallbackSummary(truncated);
  } catch {
    return fallbackSummary(truncated);
  }
}

function parseSummaryResponse(raw: string): DocumentSummaryResult | null {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").trim();
  try {
    const obj = JSON.parse(cleaned);
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
    const keyFacts = Array.isArray(obj.keyFacts)
      ? obj.keyFacts.map((x: unknown) => String(x).trim()).filter(Boolean)
      : [];
    return { summary, keyFacts };
  } catch {
    return null;
  }
}

function fallbackSummary(text: string): DocumentSummaryResult {
  const excerpt = text.slice(0, 500).trim();
  return {
    summary: excerpt ? `${excerpt}${text.length > 500 ? "…" : ""}` : "",
    keyFacts: [],
  };
}
