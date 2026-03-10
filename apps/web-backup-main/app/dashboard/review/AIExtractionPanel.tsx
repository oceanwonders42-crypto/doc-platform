"use client";

type ExtractedData = {
  clientName?: string | null;
  provider?: string | null;
  treatmentDates?: string | null;
  diagnosis?: string | null;
  procedure?: string | null;
  settlementOffer?: number | null;
  policyLimits?: string | null;
};

function extractFromDoc(doc: Record<string, unknown>): ExtractedData {
  const extractedFields = (doc.extractedFields ?? doc.extracted_fields) as Record<string, unknown> | null | undefined;
  const insuranceFields = doc.insuranceFields as
    | { settlementOffer?: number | null; policyLimits?: string | null }
    | null
    | undefined;

  const insurance = extractedFields?.insurance as Record<string, unknown> | undefined;
  const offerFromInsurance =
    insuranceFields?.settlementOffer ??
    (insurance?.settlementOffer as number | undefined) ??
    (insurance?.offerAmount as number | undefined) ??
    (extractedFields?.settlementOffer as number | undefined);

  const treatmentDatesRaw =
    extractedFields?.treatmentDates ??
    extractedFields?.treatmentDate ??
    extractedFields?.dateOfService ??
    extractedFields?.serviceDate ??
    extractedFields?.dates;
  const treatmentDatesStr = Array.isArray(treatmentDatesRaw)
    ? treatmentDatesRaw.map(String).filter(Boolean).join(", ")
    : treatmentDatesRaw != null && String(treatmentDatesRaw).trim() !== ""
      ? String(treatmentDatesRaw)
      : null;

  return {
    clientName:
      (doc.clientName as string) ??
      extractedFields?.clientName ??
      extractedFields?.client_name ??
      null,
    provider:
      (doc.provider as string) ??
      extractedFields?.provider ??
      extractedFields?.facility ??
      (doc.facility as string) ??
      null,
    treatmentDates: treatmentDatesStr,
    diagnosis:
      (extractedFields?.diagnosis as string) ?? null,
    procedure:
      (extractedFields?.procedure as string) ?? null,
    settlementOffer: offerFromInsurance != null && Number.isFinite(Number(offerFromInsurance))
      ? Number(offerFromInsurance)
      : null,
    policyLimits:
      insuranceFields?.policyLimits ??
      (insurance?.policyLimits as string) ??
      (extractedFields?.policyLimits as string) ??
      null,
  };
}

const FINANCIAL_FIELD_KEYS = new Set(["settlementOffer", "policyLimits"]);

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function AIExtractionPanel({ doc }: { doc: Record<string, unknown> }) {
  const data = extractFromDoc(doc);
  const hasAny =
    data.clientName ||
    data.provider ||
    data.treatmentDates ||
    data.diagnosis ||
    data.procedure ||
    data.settlementOffer != null ||
    data.policyLimits;

  if (!hasAny) return null;

  const rows: { label: string; value: string | null; isFinancial: boolean }[] = [
    { label: "Client name", value: data.clientName ?? null, isFinancial: false },
    { label: "Provider", value: data.provider ?? null, isFinancial: false },
    { label: "Treatment dates", value: data.treatmentDates ?? null, isFinancial: false },
    { label: "Diagnosis", value: data.diagnosis ?? null, isFinancial: false },
    { label: "Procedure", value: data.procedure ?? null, isFinancial: false },
    {
      label: "Settlement offer",
      value: data.settlementOffer != null ? formatUsd(data.settlementOffer) : null,
      isFinancial: true,
    },
    { label: "Policy limits", value: data.policyLimits ?? null, isFinancial: true },
  ].filter((r) => r.value != null && String(r.value).trim() !== "");

  if (rows.length === 0) return null;

  return (
    <section
      style={{
        marginTop: 16,
        padding: "14px 16px",
        background: "linear-gradient(135deg, #f0f7ff 0%, #e8f4fc 100%)",
        borderRadius: 10,
        border: "1px solid #c5d9f0",
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px 0", color: "#1a365d" }}>
        AI Extraction
      </h3>
      <p style={{ fontSize: 12, color: "#555", margin: "0 0 12px 0" }}>
        Key fields extracted from the document.
      </p>
      <dl style={{ margin: 0, fontSize: 13 }}>
        {rows.map(({ label, value, isFinancial }) => (
          <div key={label} style={{ marginBottom: 8 }}>
            <dt style={{ fontWeight: 600, color: "#555", marginBottom: 2, fontSize: 12 }}>
              {label}
            </dt>
            <dd
              style={{
                margin: 0,
                ...(isFinancial
                  ? {
                      fontWeight: 700,
                      color: "#0d47a1",
                      background: "rgba(13, 71, 161, 0.12)",
                      padding: "4px 8px",
                      borderRadius: 6,
                      display: "inline-block",
                      border: "1px solid rgba(13, 71, 161, 0.25)",
                    }
                  : {}),
              }}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
