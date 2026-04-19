import Link from "next/link";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import DocumentActions from "./DocumentActions";
import DocumentActionCenter from "./DocumentActionCenter";
import DocumentExplainPanel from "./DocumentExplainPanel";

const DocumentViewer = dynamic(() => import("./DocumentViewer"), {
  ssr: false,
});

type AuditEvent = {
  id: string;
  documentId: string;
  firmId: string;
  actor: string;
  action: string;
  fromCaseId: string | null;
  toCaseId: string | null;
  metaJson: any | null;
  createdAt: string;
};

async function fetchDuplicates(documentId: string): Promise<{
  original: { id: string; originalName: string } | null;
  duplicates: Array<{ id: string; originalName: string }>;
}> {
  const res = await fetch(
    `${process.env.DOC_WEB_BASE_URL ?? ""}/api/documents/${documentId}/duplicates`,
    { cache: "no-store" }
  ).catch(() => null);
  if (!res || !res.ok)
    return { original: null, duplicates: [] };
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    original?: { id: string; originalName: string } | null;
    duplicates?: Array<{ id: string; originalName: string }>;
  };
  return {
    original: data.original ?? null,
    duplicates: Array.isArray(data.duplicates) ? data.duplicates : [],
  };
}

async function fetchAudit(documentId: string): Promise<AuditEvent[]> {
  const res = await fetch(`${process.env.DOC_WEB_BASE_URL ?? ""}/api/documents/${documentId}/audit`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: AuditEvent[] };
  return Array.isArray(data.items) ? data.items : [];
}

type CaseItem = { id: string; title?: string | null; caseNumber?: string | null; clientName?: string | null };

async function fetchCases(): Promise<CaseItem[]> {
  const res = await fetch(`${process.env.DOC_WEB_BASE_URL ?? ""}/api/cases`, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: CaseItem[] };
  return Array.isArray(data?.items) ? data.items : [];
}

async function fetchRecognition(documentId: string): Promise<{
  originalName: string;
  lastRunAt: string | null;
  errors: string | null;
  extractedFields: Record<string, unknown> | null;
  status: string;
  routedCaseId: string | null;
  mimeType: string | null;
  duplicateMatchCount: number;
  duplicateOfId: string | null;
  pageCount: number;
  ingestedAt: string | null;
  insights: { type: string; severity: string }[];
  risks: { type: string; severity: string }[];
  insuranceFields: {
    insuranceCompany?: string | null;
    adjusterName?: string | null;
    claimNumber?: string | null;
    settlementOffer?: number | null;
    policyLimits?: string | null;
    warnings?: string[];
  } | null;
  courtFields: {
    courtName?: string | null;
    caseNumber?: string | null;
    judge?: string | null;
    filingDate?: string | null;
    parties?: string | null;
  } | null;
}> {
  const res = await fetch(
    `${process.env.DOC_WEB_BASE_URL ?? ""}/api/documents/${documentId}/recognition`,
    { cache: "no-store" }
  ).catch(() => null);
  if (!res || !res.ok)
    return {
      originalName: "",
      lastRunAt: null,
      errors: null,
      extractedFields: null,
      status: "",
      routedCaseId: null,
      mimeType: null,
      duplicateMatchCount: 0,
      duplicateOfId: null,
      pageCount: 0,
      ingestedAt: null,
      insights: [],
      risks: [],
      insuranceFields: null,
      courtFields: null,
    };
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    document?: {
      originalName?: string;
      lastRunAt?: string | null;
      errors?: string | null;
      extractedFields?: Record<string, unknown> | null;
      status?: string;
      routedCaseId?: string | null;
      mimeType?: string | null;
      duplicateMatchCount?: number;
      duplicateOfId?: string | null;
      pageCount?: number;
      ingestedAt?: string | null;
    };
    recognition?: {
      lastRunAt?: string | null;
      insights?: { type: string; severity: string }[];
      risks?: { type: string; severity: string }[];
      insuranceFields?: {
        insuranceCompany?: string | null;
        adjusterName?: string | null;
        claimNumber?: string | null;
        settlementOffer?: number | null;
        policyLimits?: string | null;
        warnings?: string[];
      } | null;
      courtFields?: {
        courtName?: string | null;
        caseNumber?: string | null;
        judge?: string | null;
        filingDate?: string | null;
        parties?: string | null;
      } | null;
    };
  };
  const doc = data.document;
  const rec = data.recognition;
  const lastRunAt = rec?.lastRunAt ?? doc?.lastRunAt ?? null;
  const errors = doc?.errors ?? null;
  const extractedFields = doc?.extractedFields ?? null;
  const duplicateMatchCount = doc?.duplicateMatchCount ?? 0;
  const duplicateOfId = doc?.duplicateOfId ?? null;
  const insights = Array.isArray(rec?.insights) ? rec.insights : [];
  const risks = Array.isArray(rec?.risks) ? rec.risks : [];
  const insuranceFields = rec?.insuranceFields ?? null;
  const courtFields = rec?.courtFields ?? null;
  return {
    originalName: doc?.originalName ?? "",
    lastRunAt,
    errors,
    extractedFields,
    status: doc?.status ?? "",
    routedCaseId: doc?.routedCaseId ?? null,
    mimeType: doc?.mimeType ?? null,
    duplicateMatchCount,
    duplicateOfId,
    pageCount: doc?.pageCount ?? 0,
    ingestedAt: doc?.ingestedAt ?? null,
    insights,
    risks,
    insuranceFields,
    courtFields,
  };
}

function KeyFieldsSection({ extractedFields }: { extractedFields: Record<string, unknown> | null }) {
  if (!extractedFields) return null;
  const court = extractedFields.court as Record<string, unknown> | undefined;
  const insurance = extractedFields.insurance as Record<string, unknown> | undefined;
  const hasCourt = court && typeof court === "object" && (court.caseNumber || court.courtName || court.filingDate);
  const hasInsurance =
    insurance &&
    typeof insurance === "object" &&
    (insurance.claimNumber || insurance.policyNumber || insurance.insurerName || insurance.offerAmount);
  if (!hasCourt && !hasInsurance) return null;

  const row = (label: string, value: unknown) => {
    if (value == null || value === "") return null;
    return (
      <tr key={label}>
        <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>{label}</td>
        <td style={{ padding: 4 }}>{String(value)}</td>
      </tr>
    );
  };

  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Key fields</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {hasCourt ? (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", marginBottom: 6 }}>Court</h3>
            <table style={{ fontSize: 14 }}>
              <tbody>
                {row("Case number", court.caseNumber)}
                {row("Court name", court.courtName)}
                {row("County", court.county)}
                {row("Judge", court.judge)}
                {row("Filing date", court.filingDate)}
                {row("Hearing date", court.hearingDate)}
                {court.parties && typeof court.parties === "object" ? (
                  <>
                    {row("Plaintiff", (court.parties as Record<string, unknown>).plaintiff)}
                    {row("Defendant", (court.parties as Record<string, unknown>).defendant)}
                  </>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
        {hasInsurance ? (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", marginBottom: 6 }}>Insurance</h3>
            <table style={{ fontSize: 14 }}>
              <tbody>
                {row("Claim number", insurance.claimNumber)}
                {row("Policy number", insurance.policyNumber)}
                {row("Insurer", insurance.insurerName)}
                {row("Adjuster", insurance.adjusterName)}
                {row("Adjuster email", insurance.adjusterEmail)}
                {row("Adjuster phone", insurance.adjusterPhone)}
                {row("Loss date", insurance.lossDate)}
                {row("Letter date", insurance.letterDate)}
                {row("Coverage decision", insurance.coverageDecision)}
                {row("Offer amount", insurance.offerAmount)}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function InsuranceFieldsSection({
  insuranceFields,
}: {
  insuranceFields: {
    insuranceCompany?: string | null;
    adjusterName?: string | null;
    claimNumber?: string | null;
    settlementOffer?: number | null;
    policyLimits?: string | null;
    warnings?: string[];
  } | null;
}) {
  if (!insuranceFields || typeof insuranceFields !== "object") return null;
  const fmt = (v: string | number | null | undefined) => (v != null && String(v).trim() !== "" ? String(v) : "—");
  const fmtUsd = (n: number | null | undefined) =>
    n != null && Number.isFinite(n) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n) : "—";
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Insurance</h2>
      <table style={{ fontSize: 14 }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Insurance company</td>
            <td style={{ padding: 4 }}>{fmt(insuranceFields.insuranceCompany)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Adjuster</td>
            <td style={{ padding: 4 }}>{fmt(insuranceFields.adjusterName)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Claim #</td>
            <td style={{ padding: 4 }}>{fmt(insuranceFields.claimNumber)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Settlement offer</td>
            <td style={{ padding: 4 }}>{fmtUsd(insuranceFields.settlementOffer)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Policy limits</td>
            <td style={{ padding: 4 }}>{fmt(insuranceFields.policyLimits)}</td>
          </tr>
          {Array.isArray(insuranceFields.warnings) && insuranceFields.warnings.length > 0 && (
            <tr>
              <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Warnings</td>
              <td style={{ padding: 4, color: "#b45309" }}>{insuranceFields.warnings.join("; ")}</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function CourtFieldsSection({
  courtFields,
}: {
  courtFields: {
    courtName?: string | null;
    caseNumber?: string | null;
    judge?: string | null;
    filingDate?: string | null;
    parties?: string | null;
  } | null;
}) {
  if (!courtFields || typeof courtFields !== "object") return null;
  const hasAny =
    (courtFields.courtName != null && String(courtFields.courtName).trim() !== "") ||
    (courtFields.caseNumber != null && String(courtFields.caseNumber).trim() !== "") ||
    (courtFields.judge != null && String(courtFields.judge).trim() !== "") ||
    (courtFields.filingDate != null && String(courtFields.filingDate).trim() !== "") ||
    (courtFields.parties != null && String(courtFields.parties).trim() !== "");
  if (!hasAny) return null;
  const fmt = (v: string | null | undefined) => (v != null && String(v).trim() !== "" ? String(v) : "—");
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Court</h2>
      <table style={{ fontSize: 14 }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Court name</td>
            <td style={{ padding: 4 }}>{fmt(courtFields.courtName)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Case number</td>
            <td style={{ padding: 4 }}>{fmt(courtFields.caseNumber)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Judge</td>
            <td style={{ padding: 4 }}>{fmt(courtFields.judge)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Filing date</td>
            <td style={{ padding: 4 }}>{fmt(courtFields.filingDate)}</td>
          </tr>
          <tr>
            <td style={{ padding: "4px 12px 4px 0", fontWeight: 600, color: "#555", verticalAlign: "top" }}>Parties</td>
            <td style={{ padding: 4 }}>{fmt(courtFields.parties)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

const INSIGHT_LABELS: Record<string, string> = {
  pre_existing: "Pre-existing condition",
  degenerative: "Degenerative findings",
  liability_dispute: "Liability dispute",
  treatment_gap: "Treatment gap",
  causation_language: "Causation language",
  settlement_offer: "Settlement offer",
  policy_limits: "Policy limits",
};

const RISK_LABELS: Record<string, string> = {
  pre_existing: "Pre-existing condition",
  degenerative: "Degenerative",
  gap_in_treatment: "Gap in treatment",
  liability_disputed: "Liability disputed",
};

function DocumentInsightsSection({
  insights,
  risks,
}: {
  insights: { type: string; severity: string }[];
  risks: { type: string; severity: string }[];
}) {
  if (insights.length === 0 && risks.length === 0) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Document insights</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {insights.length > 0 && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#2e7d32", marginBottom: 6 }}>Detected insights</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              {insights.map((r, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <strong>{INSIGHT_LABELS[r.type] ?? r.type.replace(/_/g, " ")}</strong> ({r.severity})
                </li>
              ))}
            </ul>
          </div>
        )}
        {risks.length > 0 && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#b45309", marginBottom: 6 }}>Risk alerts</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
              {risks.map((r, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  <strong>{RISK_LABELS[r.type] ?? r.type.replace(/_/g, " ")}</strong> ({r.severity})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id) notFound();

  const [events, recognition, duplicates, cases] = await Promise.all([
    fetchAudit(id),
    fetchRecognition(id),
    fetchDuplicates(id),
    fetchCases(),
  ]);

  const isPdf = (recognition.mimeType || "").toLowerCase().includes("pdf");

  return (
    <main style={{ padding: 24, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {recognition.originalName || `Document ${id}`}
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(340px, 400px)",
          gap: 24,
          marginTop: 16,
          alignItems: "start",
        }}
      >
        <div>
          {isPdf ? (
            <section>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>PDF Viewer</h2>
              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 16,
                  background: "#fafafa",
                }}
              >
                <DocumentViewer documentId={id} />
              </div>
            </section>
          ) : (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Preview</h2>
              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 8,
                  padding: 8,
                  background: "#fafafa",
                }}
              >
                <img
                  src={`/api/documents/${id}/preview?page=1&size=large`}
                  alt=""
                  style={{
                    maxWidth: "100%",
                    maxHeight: 320,
                    objectFit: "contain",
                    borderRadius: 4,
                    background: "#f5f5f5",
                    display: "block",
                    margin: "0 auto",
                  }}
                />
              </div>
            </section>
          )}

          <DocumentActions
            documentId={id}
            lastRunAt={recognition.lastRunAt}
            errors={recognition.errors}
          />

          <DocumentInsightsSection insights={recognition.insights} risks={recognition.risks} />

          <KeyFieldsSection extractedFields={recognition.extractedFields} />

          <InsuranceFieldsSection insuranceFields={recognition.insuranceFields} />

          <CourtFieldsSection courtFields={recognition.courtFields} />

          <DocumentExplainPanel documentId={id} />
        </div>

        <aside style={{ position: "sticky", top: 24 }}>
          <DocumentActionCenter
            documentId={id}
            originalName={recognition.originalName}
            status={recognition.status}
            pageCount={recognition.pageCount}
            mimeType={recognition.mimeType}
            ingestedAt={recognition.ingestedAt}
            routedCaseId={recognition.routedCaseId}
            duplicateInfo={duplicates}
            cases={cases}
            extractedFields={recognition.extractedFields}
            auditEvents={events}
          />
        </aside>
      </div>
    </main>
  );
}
