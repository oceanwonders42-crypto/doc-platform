/**
 * Generates medical records request letter text using case + provider info.
 * Used for POST /cases/:id/records-requests to auto-fill letterBody (fax/email ready).
 */
import OpenAI from "openai";
import { prisma } from "../db/prisma";

export type RecordsLetterInput = {
  caseId: string;
  firmId: string;
  providerName: string;
  providerContact: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  notes: string | null;
};

export type RecordsLetterResult = {
  text: string;
  error?: string;
};

function fmtDate(d: Date | null): string {
  if (!d) return "";
  const x = new Date(d);
  return isNaN(x.getTime()) ? "" : x.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateRecordsRequestLetter(input: RecordsLetterInput): Promise<RecordsLetterResult> {
  const { caseId, firmId, providerName, providerContact, dateFrom, dateTo, notes } = input;

  const legalCase = await prisma.legalCase.findFirst({
    where: { id: caseId, firmId },
    select: { clientName: true, caseNumber: true, title: true },
  });

  const clientName = legalCase?.clientName ?? "[Client Name]";
  const caseNumber = legalCase?.caseNumber ?? legalCase?.title ?? caseId;
  const dateRangeStr =
    dateFrom && dateTo
      ? `from ${fmtDate(dateFrom)} through ${fmtDate(dateTo)}`
      : dateFrom
        ? `from ${fmtDate(dateFrom)}`
        : dateTo
          ? `through ${fmtDate(dateTo)}`
          : "for all dates of service";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      text: buildFallbackLetter(input, clientName, caseNumber, dateRangeStr),
      error: "OPENAI_API_KEY not set",
    };
  }

  const openai = new OpenAI({ apiKey });
  const prompt = `You are drafting a professional medical records request letter for a law firm. Output only the letter body—no subject line or "Dear Sir/Madam" unless you start with a formal salutation. Use the following facts; do not invent anything.

Provider/facility: ${providerName}
${providerContact ? `Contact/address:\n${providerContact}` : ""}

Client name: ${clientName}
Case/reference: ${caseNumber}

Date range requested: ${dateRangeStr}
${notes ? `Additional notes to include: ${notes}` : ""}

Requirements:
- Request complete, legible copies of medical records and itemized billing for the date range.
- State that records may be sent electronically or via fax.
- Keep tone professional and concise (one short letter, suitable for fax or email).
- Use today's date at the top.
- End with a thank-you and a signature block placeholder such as "Sincerely," and "[Law Firm]" or "Respectfully,".`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ??
      buildFallbackLetter(input, clientName, caseNumber, dateRangeStr);

    return { text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      text: buildFallbackLetter(input, clientName, caseNumber, dateRangeStr),
      error: message,
    };
  }
}

function buildFallbackLetter(
  input: RecordsLetterInput,
  clientName: string,
  caseNumber: string,
  dateRangeStr: string
): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const lines = [
    today,
    "",
    input.providerName,
    (input.providerContact || "").trim(),
    "",
    "Re: Request for Medical Records and Billing",
    "",
    `Please provide complete and legible copies of all medical records and itemized billing ${dateRangeStr} for our client ${clientName}, matter ${caseNumber}.`,
    "",
    input.notes ? `Additional details: ${input.notes}` : "",
    input.notes ? "" : "",
    "You may send the records electronically or via fax to our office.",
    "",
    "Thank you for your prompt attention to this request.",
    "",
    "Sincerely,",
    "[Law Firm]",
  ];
  return lines.filter((s) => s !== undefined).join("\n");
}
