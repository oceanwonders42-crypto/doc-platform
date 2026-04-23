"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  formatApiClientError,
  getApiBase,
  getAuthHeader,
  getFetchOptions,
  parseJsonResponse,
} from "@/lib/api";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { PageHeader } from "@/components/dashboard/PageHeader";

type DemandBankListItem = {
  id: string;
  matterId: string | null;
  sourceDocumentId: string | null;
  title: string;
  fileName: string | null;
  summary: string | null;
  jurisdiction: string | null;
  caseType: string | null;
  liabilityType: string | null;
  injuryTags: string[];
  treatmentTags: string[];
  bodyPartTags: string[];
  mriPresent: boolean;
  injectionsPresent: boolean;
  surgeryPresent: boolean;
  templateFamily: string | null;
  toneStyle: string | null;
  qualityScore: number | null;
  approvedForReuse: boolean;
  blockedForReuse: boolean;
  reviewStatus: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sectionCount: number;
};

type CaseItem = {
  id: string;
  title: string;
  caseNumber: string | null;
  clientName: string | null;
};

type DemandBankListResponse = {
  ok?: boolean;
  items?: DemandBankListItem[];
  error?: string;
};

type CasesResponse = {
  ok?: boolean;
  items?: CaseItem[];
};

function reviewBadgeClass(item: DemandBankListItem) {
  if (item.blockedForReuse) return "onyx-badge onyx-badge-error";
  if (item.approvedForReuse) return "onyx-badge onyx-badge-success";
  return "onyx-badge onyx-badge-warning";
}

function reviewBadgeLabel(item: DemandBankListItem) {
  if (item.blockedForReuse) return "Blocked";
  if (item.approvedForReuse) return "Approved";
  return "Pending";
}

function reuseSignals(item: DemandBankListItem) {
  const signals: string[] = [];
  if (item.mriPresent) signals.push("MRI");
  if (item.injectionsPresent) signals.push("Injections");
  if (item.surgeryPresent) signals.push("Surgery");
  return signals;
}

export default function DemandBankPage() {
  const router = useRouter();
  const [items, setItems] = useState<DemandBankListItem[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [matterId, setMatterId] = useState("");
  const [sourceDocumentId, setSourceDocumentId] = useState("");
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (reviewStatus.trim()) params.set("reviewStatus", reviewStatus.trim());

      const [bankResponse, casesResponse] = await Promise.all([
        fetch(`${getApiBase()}/demand-bank${params.size > 0 ? `?${params.toString()}` : ""}`, {
          headers: getAuthHeader(),
          ...getFetchOptions(),
        }),
        fetch(`${getApiBase()}/cases`, {
          headers: getAuthHeader(),
          ...getFetchOptions(),
        }),
      ]);

      const [bankPayload, casesPayload] = await Promise.all([
        parseJsonResponse(bankResponse),
        parseJsonResponse(casesResponse),
      ]);

      const bankData = bankPayload as DemandBankListResponse;
      const caseData = casesPayload as CasesResponse;
      if (!bankResponse.ok || !bankData.ok || !Array.isArray(bankData.items)) {
        throw new Error(bankData.error ?? "Failed to load demand bank.");
      }

      setItems(bankData.items);
      setCases(Array.isArray(caseData.items) ? caseData.items : []);
    } catch (requestError) {
      setError(formatApiClientError(requestError, "Failed to load demand bank."));
    } finally {
      setLoading(false);
    }
  }, [query, reviewStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const approved = items.filter((item) => item.approvedForReuse && !item.blockedForReuse).length;
    const blocked = items.filter((item) => item.blockedForReuse).length;
    const pending = items.length - approved - blocked;
    return { approved, blocked, pending };
  }, [items]);

  async function handleIngest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${getApiBase()}/demand-bank/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        ...getFetchOptions(),
        body: JSON.stringify({
          title: title.trim() || undefined,
          fileName: fileName.trim() || undefined,
          matterId: matterId.trim() || undefined,
          sourceDocumentId: sourceDocumentId.trim() || undefined,
          text: text.trim() || undefined,
        }),
      });
      const payload = (await parseJsonResponse(response)) as {
        ok?: boolean;
        error?: string;
        item?: { id?: string; title?: string };
      };
      if (!response.ok || !payload.ok || !payload.item?.id) {
        throw new Error(payload.error ?? "Failed to ingest demand.");
      }

      setSuccess(`Demand "${payload.item.title ?? "document"}" was banked and is now pending review.`);
      setTitle("");
      setFileName("");
      setMatterId("");
      setSourceDocumentId("");
      setText("");
      await load();
      router.push(`/dashboard/demands/bank/${payload.item.id}`);
    } catch (requestError) {
      setError(formatApiClientError(requestError, "Failed to ingest demand."));
    } finally {
      setSubmitting(false);
    }
  }

  const columns: Column<DemandBankListItem>[] = [
    {
      key: "title",
      header: "Demand",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <Link href={`/dashboard/demands/bank/${row.id}`} className="onyx-link" style={{ fontWeight: 600 }}>
            {row.title}
          </Link>
          <span style={{ fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>
            {row.fileName ?? "No file name"} · {row.sectionCount} sections
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Review",
      render: (row) => (
        <span className={reviewBadgeClass(row)} title={`Review status: ${row.reviewStatus}`}>
          {reviewBadgeLabel(row)}
        </span>
      ),
    },
    {
      key: "matter",
      header: "Matter / metadata",
      render: (row) => (
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <span>{row.caseType ?? "Unclassified"}{row.liabilityType ? ` · ${row.liabilityType}` : ""}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>
            {row.jurisdiction ?? "No jurisdiction"}{row.matterId ? " · linked matter" : " · unlinked"}
          </span>
        </div>
      ),
    },
    {
      key: "signals",
      header: "Signals",
      render: (row) => {
        const signals = reuseSignals(row);
        return signals.length > 0 ? signals.join(", ") : "—";
      },
    },
    {
      key: "quality",
      header: "Quality",
      render: (row) => (row.qualityScore != null ? String(row.qualityScore) : "—"),
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) => new Date(row.updatedAt).toLocaleDateString(),
    },
  ];

  return (
    <div style={{ padding: "0 1.5rem 1.5rem" }}>
      <PageHeader
        breadcrumbs={[{ label: "Demands", href: "/dashboard/demands" }, { label: "Demand Bank" }]}
        title="Demand Bank"
        description="Store prior approved demands as reusable style examples, review them safely, and keep them separate from current-case facts."
        action={
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title or summary"
              className="onyx-input"
              style={{ minWidth: 220 }}
            />
            <select value={reviewStatus} onChange={(event) => setReviewStatus(event.target.value)} className="onyx-input">
              <option value="">All review states</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="blocked">Blocked</option>
            </select>
            <button type="button" onClick={() => void load()} className="onyx-btn-secondary">
              Refresh
            </button>
          </div>
        }
      />

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: "1rem" }}>
        <div className="onyx-card" style={{ padding: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>Approved for reuse</p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "1.35rem", fontWeight: 700 }}>{summary.approved}</p>
        </div>
        <div className="onyx-card" style={{ padding: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>Pending review</p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "1.35rem", fontWeight: 700 }}>{summary.pending}</p>
        </div>
        <div className="onyx-card" style={{ padding: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--onyx-text-muted)" }}>Blocked from reuse</p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "1.35rem", fontWeight: 700 }}>{summary.blocked}</p>
        </div>
      </div>

      <form className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", display: "grid", gap: "0.9rem" }} onSubmit={handleIngest}>
        <div>
          <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--onyx-accent)" }}>
            Ingest Prior Demand
          </p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", color: "var(--onyx-text-secondary)" }}>
            Paste extracted demand text or reference a source document that already has OCR text. New bank entries start pending review.
          </p>
        </div>
        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="onyx-input" />
          <input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="Original file name (optional)" className="onyx-input" />
          <select value={matterId} onChange={(event) => setMatterId(event.target.value)} className="onyx-input">
            <option value="">Link to matter (optional)</option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.caseNumber ?? item.clientName ?? item.title ?? item.id}
              </option>
            ))}
          </select>
          <input
            value={sourceDocumentId}
            onChange={(event) => setSourceDocumentId(event.target.value)}
            placeholder="Source document id (optional)"
            className="onyx-input"
          />
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste extracted demand text here, or leave blank if the source document already has OCR text."
          rows={10}
          className="onyx-input"
          style={{ width: "100%", resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" className="onyx-btn-primary" disabled={submitting}>
            {submitting ? "Banking demand…" : "Bank demand"}
          </button>
          <span style={{ fontSize: "0.82rem", color: "var(--onyx-text-muted)" }}>
            Tip: if you provide a source document id, the API will reuse existing OCR text when available.
          </span>
        </div>
      </form>

      {error && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-error)" }}>
          <p style={{ margin: 0, color: "var(--onyx-error)" }}>{error}</p>
        </div>
      )}

      {success && (
        <div className="onyx-card" style={{ padding: "1rem", marginBottom: "1rem", borderColor: "var(--onyx-success)" }}>
          <p style={{ margin: 0, color: "var(--onyx-success)" }}>{success}</p>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--onyx-text-muted)" }}>Loading demand bank…</p>
      ) : (
        <div className="onyx-card" style={{ overflow: "hidden" }}>
          <DataTable
            columns={columns}
            data={items}
            emptyMessage="No banked demands yet. Ingest a prior approved demand to start the reusable bank."
          />
        </div>
      )}
    </div>
  );
}
