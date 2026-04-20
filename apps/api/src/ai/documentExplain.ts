/**
 * Document Explain: answer questions about a document using extractedFields + OCR text.
 * Returns concise bullets with optional page citations.
 */
import OpenAI from "openai";

import {
  OPENAI_TASK_TYPES,
  runOpenAiChatCompletionWithTelemetry,
} from "../services/aiTaskTelemetry";
import { computeDocumentExplainVariant, getStoredTextHash } from "../services/documentRecognitionCache";

export type DocumentExplainResult = {
  bullets: string[];
  citations?: { bulletIndex: number; page?: number }[];
};

const MAX_TEXT_LENGTH = 14000;
const DEFAULT_QUESTION = "What are the key points, dates, parties, and any monetary amounts in this document?";
export const DOCUMENT_EXPLAIN_PROMPT_VERSION = "document-explain-v1";
export const DOCUMENT_EXPLAIN_MODEL = "gpt-4o-mini";

type DocumentExplainTelemetryContext = {
  firmId?: string | null;
  documentId?: string | null;
  caseId?: string | null;
  source?: string | null;
};

/**
 * Answers a question about document content using extractedFields + OCR text.
 * Uses LLM to produce concise bullets; cites page numbers when identifiable in the text.
 */
export async function explainDocument(
  ocrText: string | null,
  extractedFields: unknown,
  question?: string | null,
  telemetryContext?: DocumentExplainTelemetryContext
): Promise<DocumentExplainResult> {
  const q = (question ?? DEFAULT_QUESTION).trim() || DEFAULT_QUESTION;

  const extractedStr =
    extractedFields != null
      ? JSON.stringify(extractedFields, null, 2)
      : "";
  const textBlock = ocrText?.trim()
    ? (ocrText.length > MAX_TEXT_LENGTH
        ? ocrText.slice(0, MAX_TEXT_LENGTH) + "\n\n[Text truncated...]"
        : ocrText)
    : "";

  const context =
    extractedStr && textBlock
      ? `## Extracted fields (structured data)\n${extractedStr}\n\n## Document text (OCR)\n${textBlock}`
      : extractedStr
        ? `## Extracted fields\n${extractedStr}`
        : textBlock
          ? `## Document text (OCR)\n${textBlock}`
          : "";

  if (!context.trim()) {
    return {
      bullets: ["No document content available. Run recognition to extract text and fields."],
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackExplain(extractedStr, textBlock);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await runOpenAiChatCompletionWithTelemetry({
      openai,
      request: {
        model: DOCUMENT_EXPLAIN_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a legal document assistant. Answer questions about documents concisely.
- Respond with bullet points (3-8 bullets).
- Cite page numbers when the source text indicates a page (e.g. "Page 2", "--- Page 3 ---").
- Format: "- [bullet text]" and add "(p. X)" at the end when you can identify the page.
- If no page markers exist, omit page citations.`,
          },
          {
            role: "user",
            content: `Document context:\n\n${context}\n\nQuestion: ${q}\n\nAnswer with concise bullet points. Include page citations (p. N) when possible.`,
          },
        ],
        max_tokens: 800,
        temperature: 0.2,
      },
      telemetry: {
        firmId: telemetryContext?.firmId ?? null,
        documentId: telemetryContext?.documentId ?? null,
        caseId: telemetryContext?.caseId ?? null,
        source: telemetryContext?.source ?? "documentExplain",
        taskType: OPENAI_TASK_TYPES.explain,
        taskVariant: computeDocumentExplainVariant(q),
        model: DOCUMENT_EXPLAIN_MODEL,
        promptVersion: DOCUMENT_EXPLAIN_PROMPT_VERSION,
        inputHash: getStoredTextHash(textBlock),
      },
    });

    const raw = completion.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallbackExplain(extractedStr, textBlock);

    const bullets = parseBullets(raw);
    return { bullets };
  } catch {
    return fallbackExplain(extractedStr, textBlock);
  }
}

function parseBullets(raw: string): string[] {
  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  const bullets: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-*•]\s*/, "").trim();
    if (cleaned) bullets.push(cleaned);
  }
  return bullets.length > 0 ? bullets : [raw];
}

function fallbackExplain(
  extractedStr: string,
  textBlock: string
): DocumentExplainResult {
  if (extractedStr) {
    try {
      const obj = JSON.parse(extractedStr) as Record<string, unknown>;
      const bullets: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        if (v != null && String(v).trim() !== "") {
          bullets.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
        }
      }
      if (bullets.length > 0) return { bullets };
    } catch {
      // ignore
    }
  }
  if (textBlock) {
    const excerpt = textBlock.slice(0, 500).trim();
    return {
      bullets: [excerpt ? `${excerpt}...` : "No content available."],
    };
  }
  return { bullets: ["No document content available."] };
}
