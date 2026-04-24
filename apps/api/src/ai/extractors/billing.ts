export interface BillingLineItemExtracted {
  providerName?: string | null;
  serviceDate?: string | null;
  procedureDescription?: string | null;
  amountCharged?: string | null;
  lineTotal?: string | null;
}

export interface BillingStatementExtracted {
  lineItems: BillingLineItemExtracted[];
  totalBilled?: string | null;
}

const DATE_REGEX = /\b(?:20\d{2}-\d{2}-\d{2}|[0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})\b/g;
const MONEY_REGEX = /\$?\s*([0-9,]+(?:\.[0-9]{2})?)/;

function normalizeMoney(value: string): string {
  return value.replace(/[^0-9.]/g, "");
}

export function extractBillingStatement(text: string): BillingStatementExtracted {
  const lineItems: BillingLineItemExtracted[] = [];
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const sentences = normalizedText
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const billedMatch = sentence.match(
      /([A-Z][A-Za-z0-9&.'\-\s]{2,80}?)\s+billed\s+\$?\s*([0-9,]+(?:\.[0-9]{2})?)\s+for\s+(.+?)\s+on\s+(.+)/i
    );
    const alternateChargeMatch = sentence.match(
      /(?:reflects|for)\s+([A-Z][A-Za-z0-9&.'\-\s]{2,80}?)(?=\s+(?:evaluation|visit|consultation|consult|treatment|therapy|exam|imaging))\s+(.+?)\s+charge of\s+\$?\s*([0-9,]+(?:\.[0-9]{2})?)\s+(?:dated|on)\s+(.+)/i
    );
    if (!billedMatch && !alternateChargeMatch) continue;

    const providerName = (billedMatch?.[1] ?? alternateChargeMatch?.[1] ?? "").trim();
    const totalAmount = normalizeMoney(billedMatch?.[2] ?? alternateChargeMatch?.[3] ?? "");
    const procedureDescription = (billedMatch?.[3] ?? alternateChargeMatch?.[2] ?? "")
      .trim()
      .replace(/\.$/, "");
    const dateTail = billedMatch?.[4] ?? alternateChargeMatch?.[4] ?? "";
    const dates = Array.from(dateTail.matchAll(DATE_REGEX)).map((match) => match[0]);

    if (dates.length === 0) {
      lineItems.push({
        providerName,
        procedureDescription,
        amountCharged: totalAmount,
        lineTotal: totalAmount,
      });
      continue;
    }

    const numericTotal = Number(totalAmount);
    const splitAmount =
      Number.isFinite(numericTotal) && dates.length > 0
        ? (numericTotal / dates.length).toFixed(2)
        : totalAmount;

    for (const serviceDate of dates) {
      lineItems.push({
        providerName,
        serviceDate,
        procedureDescription,
        amountCharged: splitAmount,
        lineTotal: splitAmount,
      });
    }
  }

  const totalBilledMatch =
    normalizedText.match(/\btotal billed charges(?: to date)? are\s+\$?\s*([0-9,]+(?:\.[0-9]{2})?)/i)
    ?? normalizedText.match(/\btotal due\s*[:\-]?\s*\$?\s*([0-9,]+(?:\.[0-9]{2})?)/i);

  return {
    lineItems,
    totalBilled: totalBilledMatch ? normalizeMoney(totalBilledMatch[1]) : null,
  };
}
