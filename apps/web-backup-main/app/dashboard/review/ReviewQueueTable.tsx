"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReviewActions, { suggestedCaseLabel, type DocumentRow, type CaseSummary } from "./ReviewActions";
import AIExtractionPanel from "./AIExtractionPanel";
import LoadingSpinner from "../../components/LoadingSpinner";
import FileTypeIcon from "../../components/FileTypeIcon";
import { formatFileSize } from "../../lib/formatFileSize";
import { statusColors } from "../../lib/statusColors";
import { useToast } from "../../components/ToastProvider";

type Props = {
  documents: DocumentRow[];
  cases: CaseSummary[];
  initialNextCursor?: string | null;
  features?: { insurance_extraction: boolean; court_extraction: boolean };
};

const MIN_CONFIRM_CONFIDENCE = 0.7;
const STORAGE_PREFIX = "review-queue/";
const CURRENT_REVIEW_USER = process.env.NEXT_PUBLIC_REVIEW_USER_NAME ?? "You";
const SLA_ORANGE_HOURS = 24;
const SLA_RED_HOURS = 72;

type ConfidenceFilter = "all" | "high" | "medium" | "low" | "missing";
type StatusFilter = "all" | "stuck";
type DocTypeFilter = "all" | "medical" | "legal" | "insurance";
type SortOption = "confidence" | "newest" | "oldest" | "client";
type BulkAction = "confirm" | "reject" | "route" | "assign" | "mark_unmatched" | "mark_needs_review" | null;

function ageHours(createdAt: string | undefined): number | null {
  if (!createdAt) return null;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (60 * 60 * 1000);
}

function formatAge(createdAt: string | undefined): string {
  const h = ageHours(createdAt);
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function isStuck(doc: DocumentRow): boolean {
  const h = ageHours((doc as Record<string, unknown>).createdAt as string | undefined);
  if (h == null || h <= SLA_ORANGE_HOURS) return false;
  const routed = doc.routedCaseId != null && String(doc.routedCaseId).trim() !== "";
  return !routed;
}

function rowHighlightStyle(createdAt: string | undefined): { background?: string } {
  const h = ageHours(createdAt);
  if (h == null || h < SLA_ORANGE_HOURS) return {};
  if (h >= SLA_RED_HOURS) return { background: statusColors.error.bg };
  return { background: statusColors.warning.bg };
}

function casesFromDocs(docs: DocumentRow[]): CaseSummary[] {
  const seen = new Set<string>();
  const list: CaseSummary[] = [];
  for (const d of docs) {
    const id = d.suggestedCaseId ?? d.routedCaseId;
    if (id && !seen.has(id)) {
      seen.add(id);
      list.push({
        id,
        caseNumber: String(id).slice(0, 12),
        title: "",
        clientName: "",
      });
    }
  }
  return list;
}

function mergeCases(a: CaseSummary[], b: CaseSummary[]): CaseSummary[] {
  const byId = new Map<string, CaseSummary>();
  for (const c of a) byId.set(c.id, c);
  for (const c of b) if (!byId.has(c.id)) byId.set(c.id, c);
  return Array.from(byId.values());
}

function matchesSearch(doc: DocumentRow, casesList: CaseSummary[], q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.trim().toLowerCase();
  const matchReason = doc.matchReason ?? (doc as Record<string, unknown>).match_reason;
  const parts = [
    doc.fileName ?? "",
    doc.clientName ?? "",
    (doc as Record<string, unknown>).facility ?? "",
    (doc as Record<string, unknown>).provider ?? "",
    doc.suggestedCaseId ?? "",
    suggestedCaseLabel(doc, casesList),
    matchReason != null ? String(matchReason) : "",
  ].filter(Boolean);
  return parts.some((p) => String(p).toLowerCase().includes(lower));
}

function matchesConfidence(doc: DocumentRow, filter: ConfidenceFilter): boolean {
  const c = (doc as Record<string, unknown>).matchConfidence as number | null | undefined;
  const val = c != null ? Number(c) : null;
  if (filter === "all") return true;
  if (filter === "missing") return val == null;
  if (val == null) return filter === "low";
  if (filter === "high") return val >= 0.9;
  if (filter === "medium") return val >= 0.7 && val < 0.9;
  return val < 0.7;
}

function matchesStatusFilter(doc: DocumentRow, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  return isStuck(doc);
}

function matchesDocTypeFilter(
  doc: DocumentRow,
  filter: DocTypeFilter,
  feat: { insurance_extraction: boolean; court_extraction: boolean }
): boolean {
  if (filter === "all") return true;
  if (filter === "legal" && !feat.court_extraction) return false;
  if (filter === "insurance" && !feat.insurance_extraction) return false;
  const docType = (doc as Record<string, unknown>).docType as string | null | undefined;
  if (!docType) return filter === "medical";
  if (filter === "legal") return docType.startsWith("court_");
  if (filter === "insurance") return docType.startsWith("insurance_");
  return !docType.startsWith("court_") && !docType.startsWith("insurance_");
}

function sortDocs(docs: DocumentRow[], sort: SortOption): DocumentRow[] {
  const arr = [...docs];
  if (sort === "confidence") {
    arr.sort((a, b) => {
      const va = (a as Record<string, unknown>).matchConfidence as number | null | undefined;
      const vb = (b as Record<string, unknown>).matchConfidence as number | null | undefined;
      const na = va != null ? Number(va) : -1;
      const nb = vb != null ? Number(vb) : -1;
      return nb - na;
    });
  } else if (sort === "newest") {
    arr.sort((a, b) => {
      const ta = (a as Record<string, unknown>).createdAt as string | undefined;
      const tb = (b as Record<string, unknown>).createdAt as string | undefined;
      return (tb ?? "").localeCompare(ta ?? "");
    });
  } else if (sort === "oldest") {
    arr.sort((a, b) => {
      const ta = (a as Record<string, unknown>).createdAt as string | undefined;
      const tb = (b as Record<string, unknown>).createdAt as string | undefined;
      return (ta ?? "").localeCompare(tb ?? "");
    });
  } else {
    arr.sort((a, b) => {
      const ca = (a.clientName ?? "").toLowerCase();
      const cb = (b.clientName ?? "").toLowerCase();
      return ca.localeCompare(cb);
    });
  }
  return arr;
}

export default function ReviewQueueTable({ documents, cases, initialNextCursor = null, features = { insurance_extraction: false, court_extraction: false } }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<DocTypeFilter>("all");
  const [sort, setSort] = useState<SortOption>("confidence");
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor ?? null);
  const [extraDocuments, setExtraDocuments] = useState<DocumentRow[]>([]);
  const [extraCases, setExtraCases] = useState<CaseSummary[]>([]);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [lastDrawerRouteCaseId, setLastDrawerRouteCaseId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkErrors, setBulkErrors] = useState<Array<{ id: string; message: string }>>([]);
  const [bulkRouteCaseId, setBulkRouteCaseId] = useState<string>("");
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [drawerRouteCaseId, setDrawerRouteCaseId] = useState<string>("");
  const [drawerConfirmAcknowledged, setDrawerConfirmAcknowledged] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");
  const [previewImageError, setPreviewImageError] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);

  const allDocuments = useMemo(
    () => [...documents, ...extraDocuments],
    [documents, extraDocuments]
  );
  const allCases = useMemo(
    () => mergeCases(cases, extraCases),
    [cases, extraCases]
  );

  useEffect(() => {
    setNextCursor(initialNextCursor ?? null);
    setExtraDocuments([]);
    setExtraCases([]);
  }, [initialNextCursor, documents.length]);

  const filtered = useMemo(() => {
    const filteredList = allDocuments.filter(
      (doc) =>
        matchesSearch(doc, allCases, search) &&
        matchesConfidence(doc, confidenceFilter) &&
        matchesStatusFilter(doc, statusFilter) &&
        matchesDocTypeFilter(doc, docTypeFilter, features)
    );
    return sortDocs(filteredList, sort);
  }, [allDocuments, allCases, search, confidenceFilter, statusFilter, docTypeFilter, sort, features]);

  const filteredIdsKey = useMemo(() => filtered.map((d) => d.id).join("|"), [filtered]);
  const someSelected = selectedIds.size > 0;

  useEffect(() => {
    setFocusedRowIndex((prev) => {
      const max = Math.max(0, filtered.length - 1);
      return prev > max ? max : prev;
    });
  }, [filtered.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const q = localStorage.getItem(STORAGE_PREFIX + "searchQuery");
      if (q != null) setSearch(q);
      const cf = localStorage.getItem(STORAGE_PREFIX + "confidenceFilter");
      if (cf != null && ["all", "high", "medium", "low", "missing"].includes(cf))
        setConfidenceFilter(cf as ConfidenceFilter);
      const st = localStorage.getItem(STORAGE_PREFIX + "statusFilter");
      if (st != null && ["all", "stuck"].includes(st)) setStatusFilter(st as StatusFilter);
      const sm = localStorage.getItem(STORAGE_PREFIX + "sortMode");
      if (sm != null && ["confidence", "newest", "oldest", "client"].includes(sm))
        setSort(sm as SortOption);
      const ld = localStorage.getItem(STORAGE_PREFIX + "lastDrawerRouteCaseId");
      if (ld != null) setLastDrawerRouteCaseId(ld);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_PREFIX + "searchQuery", search);
    } catch {
      // ignore
    }
  }, [search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_PREFIX + "confidenceFilter", confidenceFilter);
    } catch {
      // ignore
    }
  }, [confidenceFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_PREFIX + "statusFilter", statusFilter);
    } catch {
      // ignore
    }
  }, [statusFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_PREFIX + "sortMode", sort);
    } catch {
      // ignore
    }
  }, [sort]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_PREFIX + "lastDrawerRouteCaseId", lastDrawerRouteCaseId);
    } catch {
      // ignore
    }
  }, [lastDrawerRouteCaseId]);

  // Keyboard: j/k move selection, a assign, u unmatched, r needs review (when table has focus, no preview)
  useEffect(() => {
    if (previewDoc) return;
    const h = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "j" && filtered.length > 0) {
        e.preventDefault();
        setFocusedRowIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === "k" && filtered.length > 0) {
        e.preventDefault();
        setFocusedRowIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "a" && bulkAction === null && (someSelected || filtered.length > 0)) {
        e.preventDefault();
        const ids = someSelected ? [...selectedIds] : [filtered[focusedRowIndex]?.id].filter(Boolean);
        if (ids.length > 0 && bulkRouteCaseId.trim()) {
          runBulkAssign(ids);
        }
        return;
      }
      if (e.key === "u" && bulkAction === null && (someSelected || filtered.length > 0)) {
        e.preventDefault();
        const ids = someSelected ? [...selectedIds] : [filtered[focusedRowIndex]?.id].filter(Boolean);
        if (ids.length > 0) runBulkMarkUnmatched(ids);
        return;
      }
      if (e.key === "r" && bulkAction === null && (someSelected || filtered.length > 0)) {
        e.preventDefault();
        const ids = someSelected ? [...selectedIds] : [filtered[focusedRowIndex]?.id].filter(Boolean);
        if (ids.length > 0) runBulkMarkNeedsReview(ids);
        return;
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [previewDoc, filtered.length, focusedRowIndex, someSelected, selectedIds, bulkRouteCaseId, bulkAction, filteredIdsKey]);

  useEffect(() => {
    if (!previewDoc) return;
    const h = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "Escape") {
        setPreviewDoc(null);
        return;
      }
      if (e.key === "c") {
        const claimedBy = (previewDoc as Record<string, unknown>).claimedBy as string | null | undefined;
        const isClaimedByOther =
          claimedBy != null && String(claimedBy).trim() !== "" && String(claimedBy) !== CURRENT_REVIEW_USER;
        if (!isClaimedByOther && previewDoc.suggestedCaseId && !previewLoading) handleDrawerConfirm(previewDoc);
        return;
      }
      if (e.key === "r") {
        const claimedBy = (previewDoc as Record<string, unknown>).claimedBy as string | null | undefined;
        const isClaimedByOther =
          claimedBy != null && String(claimedBy).trim() !== "" && String(claimedBy) !== CURRENT_REVIEW_USER;
        if (!isClaimedByOther && !previewLoading) handleDrawerReject(previewDoc);
        return;
      }
      if (e.key === "o") {
        window.open(`/documents/${previewDoc.id}`, "_blank");
        return;
      }
      if (e.key === "j") {
        const idx = filtered.findIndex((d) => d.id === previewDoc.id);
        if (idx >= 0 && idx < filtered.length - 1) {
          const next = filtered[idx + 1];
          setPreviewDoc(next);
        }
        return;
      }
      if (e.key === "k") {
        const idx = filtered.findIndex((d) => d.id === previewDoc.id);
        if (idx > 0) {
          const prev = filtered[idx - 1];
          setPreviewDoc(prev);
        }
        return;
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
    // NOTE: do not add `filtered` to deps; use filteredIdsKey to avoid TDZ issues.
  }, [previewDoc, filteredIdsKey, previewLoading, handleDrawerConfirm, handleDrawerReject]);

  useEffect(() => {
    if (previewDoc) {
      setDrawerRouteCaseId(previewDoc.suggestedCaseId ?? lastDrawerRouteCaseId ?? "");
      setDrawerConfirmAcknowledged(false);
      setPreviewImageError(false);
    }
  }, [previewDoc, lastDrawerRouteCaseId]);

  const queueMetrics = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    let missing = 0;
    for (const doc of allDocuments) {
      const c = (doc as Record<string, unknown>).matchConfidence as number | null | undefined;
      const val = c != null ? Number(c) : null;
      if (val == null) missing++;
      else if (val >= 0.9) high++;
      else if (val >= 0.7) medium++;
      else low++;
    }
    return { total: allDocuments.length, high, medium, low, missing };
  }, [allDocuments]);

  const selectedDocs = useMemo(
    () => filtered.filter((d) => selectedIds.has(d.id)),
    [filtered, selectedIds]
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selectedIds.has(d.id));
  const canBulkConfirm =
    someSelected &&
    selectedDocs.some((d) => d.suggestedCaseId) &&
    bulkAction === null;
  const canBulkRoute =
    someSelected &&
    bulkRouteCaseId.trim() !== "" &&
    bulkAction === null;
  const canBulkAssign = someSelected && bulkRouteCaseId.trim() !== "" && bulkAction === null;
  const canBulkMarkUnmatched = someSelected && bulkAction === null;
  const canBulkMarkNeedsReview = someSelected && bulkAction === null;

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((d) => d.id)));
    }
  }, [filtered, allFilteredSelected]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkErrors([]);
  }, []);

  function getNextPreviewDoc(currentDoc: DocumentRow, list: DocumentRow[]): DocumentRow | null {
    const idx = list.findIndex((d) => d.id === currentDoc.id);
    if (idx < 0) return null;
    if (idx < list.length - 1) return list[idx + 1];
    if (idx > 0) return list[idx - 1];
    return null;
  }

  async function runBulkConfirm() {
    const toConfirm = selectedDocs.filter((d) => d.suggestedCaseId);
    const skippedCount = selectedDocs.filter((d) => !d.suggestedCaseId).length;
    const errors: Array<{ id: string; message: string }> = [];
    if (toConfirm.length === 0) {
      setBulkErrors([]);
      setSelectedIds(new Set());
      setToastMessage(`Confirmed 0, skipped ${skippedCount}, failed 0`);
      setToastType("success");
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    setBulkErrors([]);
    setBulkAction("confirm");
    setBulkProgress({ current: 0, total: toConfirm.length });
    let confirmed = 0;
    for (let i = 0; i < toConfirm.length; i++) {
      setBulkProgress({ current: i + 1, total: toConfirm.length });
      const doc = toConfirm[i];
      try {
        const res = await fetch(`/api/documents/${doc.id}/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId: doc.suggestedCaseId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          errors.push({ id: doc.id, message: data?.error ?? `HTTP ${res.status}` });
        } else {
          confirmed++;
        }
      } catch (e) {
        errors.push({ id: doc.id, message: String(e) });
      }
    }
    setBulkErrors(errors);
    setBulkAction(null);
    setBulkProgress({ current: 0, total: 0 });
    setSelectedIds(new Set());
    const failed = errors.length;
    setToastMessage(`Confirmed ${confirmed}, skipped ${skippedCount}, failed ${failed}`);
    setToastType(failed > 0 ? "error" : "success");
    if (failed === 0) setTimeout(() => setToastMessage(null), 3000);
    router.refresh();
  }

  async function runBulkReject() {
    if (selectedDocs.length === 0) return;
    setBulkErrors([]);
    setBulkAction("reject");
    setBulkProgress({ current: 0, total: selectedDocs.length });
    const errors: Array<{ id: string; message: string }> = [];
    let rejected = 0;
    for (let i = 0; i < selectedDocs.length; i++) {
      setBulkProgress({ current: i + 1, total: selectedDocs.length });
      const doc = selectedDocs[i];
      try {
        const res = await fetch(`/api/documents/${doc.id}/reject`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          errors.push({ id: doc.id, message: data?.error ?? `HTTP ${res.status}` });
        } else {
          rejected++;
        }
      } catch (e) {
        errors.push({ id: doc.id, message: String(e) });
      }
    }
    setBulkErrors(errors);
    setBulkAction(null);
    setBulkProgress({ current: 0, total: 0 });
    setSelectedIds(new Set());
    const failed = errors.length;
    setToastMessage(failed > 0 ? `Rejected ${rejected}, failed ${failed}` : `Rejected ${rejected}`);
    setToastType(failed > 0 ? "error" : "success");
    if (failed === 0) setTimeout(() => setToastMessage(null), 3000);
    router.refresh();
  }

  async function runBulkRoute() {
    const caseId = bulkRouteCaseId.trim();
    if (!caseId || selectedDocs.length === 0) return;
    setBulkErrors([]);
    setBulkAction("route");
    setBulkProgress({ current: 0, total: selectedDocs.length });
    const errors: Array<{ id: string; message: string }> = [];
    let routed = 0;
    for (let i = 0; i < selectedDocs.length; i++) {
      setBulkProgress({ current: i + 1, total: selectedDocs.length });
      const doc = selectedDocs[i];
      try {
        const res = await fetch(`/api/documents/${doc.id}/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          errors.push({ id: doc.id, message: data?.error ?? `HTTP ${res.status}` });
        } else {
          routed++;
        }
      } catch (e) {
        errors.push({ id: doc.id, message: String(e) });
      }
    }
    setBulkErrors(errors);
    setBulkAction(null);
    setBulkProgress({ current: 0, total: 0 });
    setSelectedIds(new Set());
    const failed = errors.length;
    setToastMessage(failed > 0 ? `Routed ${routed}, failed ${failed}` : `Routed ${routed}`);
    setToastType(failed > 0 ? "error" : "success");
    if (failed === 0) {
      setTimeout(() => setToastMessage(null), 3000);
      if (routed > 0) toast.toastSuccess("Case created");
    }
    router.refresh();
  }

  async function runBulkAssign(overrideIds?: string[]) {
    const caseId = bulkRouteCaseId.trim();
    const ids = overrideIds ?? selectedDocs.map((d) => d.id);
    if (!caseId || ids.length === 0) return;
    if (overrideIds) setSelectedIds(new Set());
    setBulkErrors([]);
    setBulkAction("assign");
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: ids,
          action: "assign_case",
          caseId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; updated?: number; error?: string };
      setBulkAction(null);
      setSelectedIds(new Set());
      if (res.ok && data.ok) {
        setToastMessage(`Assigned ${data.updated ?? ids.length} to case`);
        setToastType("success");
        setTimeout(() => setToastMessage(null), 3000);
      } else {
        setBulkErrors([{ id: "bulk", message: data?.error ?? `HTTP ${res.status}` }]);
        setToastMessage(data?.error ?? "Failed");
        setToastType("error");
      }
      router.refresh();
    } catch (e) {
      setBulkAction(null);
      setBulkErrors([{ id: "bulk", message: String(e) }]);
      setToastMessage(String(e));
      setToastType("error");
    }
  }

  async function runBulkMarkUnmatched(overrideIds?: string[]) {
    const ids = overrideIds ?? selectedDocs.map((d) => d.id);
    if (ids.length === 0) return;
    if (overrideIds) setSelectedIds(new Set());
    setBulkErrors([]);
    setBulkAction("mark_unmatched");
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: ids,
          action: "mark_unmatched",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; updated?: number; error?: string };
      setBulkAction(null);
      setSelectedIds(new Set());
      if (res.ok && data.ok) {
        setToastMessage(`Marked ${data.updated ?? ids.length} as unmatched`);
        setToastType("success");
        setTimeout(() => setToastMessage(null), 3000);
      } else {
        setBulkErrors([{ id: "bulk", message: data?.error ?? `HTTP ${res.status}` }]);
        setToastMessage(data?.error ?? "Failed");
        setToastType("error");
      }
      router.refresh();
    } catch (e) {
      setBulkAction(null);
      setBulkErrors([{ id: "bulk", message: String(e) }]);
      setToastMessage(String(e));
      setToastType("error");
    }
  }

  async function runBulkMarkNeedsReview(overrideIds?: string[]) {
    const ids = overrideIds ?? selectedDocs.map((d) => d.id);
    if (ids.length === 0) return;
    if (overrideIds) setSelectedIds(new Set());
    setBulkErrors([]);
    setBulkAction("mark_needs_review");
    try {
      const res = await fetch("/api/documents/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: ids,
          action: "mark_needs_review",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; updated?: number; error?: string };
      setBulkAction(null);
      setSelectedIds(new Set());
      if (res.ok && data.ok) {
        setToastMessage(`Marked ${data.updated ?? ids.length} as needs review`);
        setToastType("success");
        setTimeout(() => setToastMessage(null), 3000);
      } else {
        setBulkErrors([{ id: "bulk", message: data?.error ?? `HTTP ${res.status}` }]);
        setToastMessage(data?.error ?? "Failed");
        setToastType("error");
      }
      router.refresh();
    } catch (e) {
      setBulkAction(null);
      setBulkErrors([{ id: "bulk", message: String(e) }]);
      setToastMessage(String(e));
      setToastType("error");
    }
  }

  async function handleDrawerConfirm(doc: DocumentRow) {
    if (!doc.suggestedCaseId) return;
    setToastMessage(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: doc.suggestedCaseId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to confirm");
      setToastMessage("Confirmed");
      setToastType("success");
      setDrawerConfirmAcknowledged(false);
      const next = getNextPreviewDoc(doc, filtered);
      setPreviewDoc(next ?? null);
      if (next) setDrawerRouteCaseId(next.suggestedCaseId ?? lastDrawerRouteCaseId ?? "");
      router.refresh();
      setTimeout(() => setToastMessage(null), 2000);
    } catch (e) {
      setToastMessage(String(e));
      setToastType("error");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDrawerReject(doc: DocumentRow) {
    setToastMessage(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/reject`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to reject");
      }
      setToastMessage("Rejected");
      setToastType("success");
      const next = getNextPreviewDoc(doc, filtered);
      setPreviewDoc(next ?? null);
      if (next) setDrawerRouteCaseId(next.suggestedCaseId ?? lastDrawerRouteCaseId ?? "");
      router.refresh();
      setTimeout(() => setToastMessage(null), 2000);
    } catch (e) {
      setToastMessage(String(e));
      setToastType("error");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDrawerReroute(doc: DocumentRow, caseId: string) {
    if (!caseId.trim()) return;
    setToastMessage(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: caseId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to route");
      setToastMessage("Routed");
      setToastType("success");
      const next = getNextPreviewDoc(doc, filtered);
      setPreviewDoc(next ?? null);
      if (next) setDrawerRouteCaseId(next.suggestedCaseId ?? lastDrawerRouteCaseId ?? "");
      router.refresh();
      setTimeout(() => setToastMessage(null), 2000);
    } catch (e) {
      setToastMessage(String(e));
      setToastType("error");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadMoreLoading) return;
    setLoadMoreLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", cursor: nextCursor });
      const res = await fetch(`/api/review-queue?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: DocumentRow[]; nextCursor: string | null };
      setExtraDocuments((prev) => [...prev, ...data.items]);
      setExtraCases((prev) => mergeCases(prev, casesFromDocs(data.items)));
      setNextCursor(data.nextCursor);
    } finally {
      setLoadMoreLoading(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search document, client, facility, provider, case…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
            minWidth: 260,
          }}
        />
        <select
          value={confidenceFilter}
          onChange={(e) => setConfidenceFilter(e.target.value as ConfidenceFilter)}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        >
          <option value="all">All</option>
          <option value="high">High (≥ 0.90)</option>
          <option value="medium">Medium (0.70 – 0.89)</option>
          <option value="low">Low (&lt; 0.70)</option>
          <option value="missing">Missing</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        >
          <option value="all">All</option>
          <option value="stuck">Stuck (&gt;24h, not routed)</option>
        </select>
        <select
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value as DocTypeFilter)}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        >
          <option value="all">All types</option>
          <option value="medical">Medical</option>
          {features.court_extraction && <option value="legal">Legal</option>}
          {features.insurance_extraction && <option value="insurance">Insurance</option>}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          style={{
            padding: "8px 12px",
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 6,
          }}
        >
          <option value="confidence">Confidence (high → low)</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="client">Client A–Z</option>
        </select>
        <span style={{ fontSize: 14, color: "#666" }}>
          Showing {filtered.length} of {allDocuments.length}
        </span>
      </div>

      <div style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
        Queue: <strong>{queueMetrics.total}</strong> total · High: {queueMetrics.high} · Medium: {queueMetrics.medium} · Low: {queueMetrics.low} · Missing: {queueMetrics.missing}
        <span style={{ marginLeft: 12, color: "#888" }}>Shortcuts: j/k move · a assign · u unmatched · r needs review</span>
      </div>

      {someSelected && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "10px 12px",
            marginBottom: 12,
            background: "#f0f4ff",
            border: "1px solid #c0d0f0",
            borderRadius: 6,
          }}
        >
          <span style={{ fontWeight: 500 }}>
            {selectedIds.size} selected
            {bulkAction === "confirm" && ` · Confirming ${bulkProgress.current}/${bulkProgress.total}…`}
            {bulkAction === "reject" && ` · Rejecting ${bulkProgress.current}/${bulkProgress.total}…`}
            {bulkAction === "route" && ` · Routing ${bulkProgress.current}/${bulkProgress.total}…`}
            {bulkAction === "assign" && " · Assigning…"}
            {bulkAction === "mark_unmatched" && " · Marking unmatched…"}
            {bulkAction === "mark_needs_review" && " · Marking needs review…"}
          </span>
          <button
            type="button"
            onClick={runBulkConfirm}
            disabled={!canBulkConfirm}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: `1px solid ${statusColors.success.border}`,
              borderRadius: 4,
              cursor: canBulkConfirm ? "pointer" : "not-allowed",
              background: canBulkConfirm ? statusColors.success.bg : "#eee",
              color: canBulkConfirm ? statusColors.success.text : "#999",
            }}
          >
            Bulk Confirm
          </button>
          <button
            type="button"
            onClick={runBulkReject}
            disabled={bulkAction !== null}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: `1px solid ${statusColors.error.border}`,
              borderRadius: 4,
              cursor: bulkAction === null ? "pointer" : "not-allowed",
              background: bulkAction === null ? statusColors.error.bg : "#eee",
            }}
          >
            Bulk Reject
          </button>
          <select
            value={bulkRouteCaseId}
            onChange={(e) => setBulkRouteCaseId(e.target.value)}
            disabled={bulkAction !== null}
            style={{
              padding: "6px 10px",
              fontSize: 13,
              border: "1px solid #ccc",
              borderRadius: 4,
              minWidth: 180,
              background: bulkAction === null ? "#fff" : "#eee",
            }}
            aria-label="Assign to case"
          >
            <option value="">Assign to Case…</option>
            {allCases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} – {c.title ?? ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => runBulkAssign()}
            disabled={!canBulkAssign}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: "1px solid #66a",
              borderRadius: 4,
              cursor: canBulkAssign ? "pointer" : "not-allowed",
              background: canBulkAssign ? "#eef" : "#eee",
              color: canBulkAssign ? "#000" : "#999",
            }}
          >
            Assign
          </button>
          <button
            type="button"
            onClick={() => runBulkMarkNeedsReview()}
            disabled={!canBulkMarkNeedsReview}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: `1px solid ${statusColors.warning.border}`,
              borderRadius: 4,
              cursor: canBulkMarkNeedsReview ? "pointer" : "not-allowed",
              background: canBulkMarkNeedsReview ? statusColors.warning.bg : "#eee",
              color: canBulkMarkNeedsReview ? statusColors.warning.text : "#999",
            }}
          >
            Mark Needs Review
          </button>
          <button
            type="button"
            onClick={() => runBulkMarkUnmatched()}
            disabled={!canBulkMarkUnmatched}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: `1px solid ${statusColors.error.border}`,
              borderRadius: 4,
              cursor: canBulkMarkUnmatched ? "pointer" : "not-allowed",
              background: canBulkMarkUnmatched ? statusColors.error.bg : "#eee",
              color: canBulkMarkUnmatched ? statusColors.error.text : "#999",
            }}
          >
            Mark Unmatched
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkAction !== null}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: "1px solid #999",
              borderRadius: 4,
              cursor: bulkAction === null ? "pointer" : "not-allowed",
              background: "#fff",
            }}
          >
            Clear
          </button>
        </div>
      )}

      {bulkErrors.length > 0 && (
        <div style={{ marginBottom: 12, padding: 10, background: statusColors.error.bg, border: `1px solid ${statusColors.error.border}`, borderRadius: 6 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Errors:</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
            {bulkErrors.map(({ id, message }) => (
              <li key={id}>
                <code>{id}</code>: {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: "#666" }}>
          {allDocuments.length === 0 ? "No documents need review." : "No documents match the filters."}
        </p>
      ) : (
        <div className="table-scroll-wrapper">
          <table className="dashboard-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #eee", background: "#fafafa" }}>
                <th style={{ padding: "12px 16px", width: 40, fontSize: 14, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected && !allFilteredSelected;
                    }}
                    onChange={toggleSelectAll}
                    aria-label="Select all filtered rows"
                  />
                </th>
                <th style={{ padding: "12px 16px", width: 60, fontSize: 14, fontWeight: 600 }}>Thumb</th>
                <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Document</th>
                <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Age</th>
                <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Client</th>
                <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Suggested Case</th>
                <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Confidence</th>
                <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Why</th>
                <th style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, idx) => {
                const createdAt = (doc as Record<string, unknown>).createdAt as string | undefined;
                const ageStyle = rowHighlightStyle(createdAt);
                const isFocused = idx === focusedRowIndex;
                return (
                <tr
                  key={doc.id}
                  style={{
                    borderBottom: "1px solid #eee",
                    ...ageStyle,
                    ...(isFocused ? { background: "rgba(100, 130, 255, 0.08)", outline: "1px solid rgba(100, 130, 255, 0.4)" } : {}),
                  }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(doc.id)}
                      onChange={() => toggleRow(doc.id)}
                      disabled={bulkAction !== null}
                      aria-label={`Select ${doc.fileName ?? doc.id}`}
                    />
                  </td>
                  <td style={{ padding: "12px 16px", width: 60 }}>
                    <img
                      src={`/api/documents/${doc.id}/preview?page=1&size=small`}
                      alt=""
                      style={{
                        width: 40,
                        height: 40,
                        objectFit: "cover",
                        borderRadius: 4,
                        background: "#f5f5f5",
                      }}
                    />
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <FileTypeIcon filename={doc.fileName ?? doc.id} />
                      <Link
                        href={`/documents/${doc.id}`}
                        style={{ fontWeight: 500, color: "inherit", textDecoration: "underline" }}
                      >
                        {doc.fileName ?? doc.id}
                      </Link>
                      <span style={{ color: "#888", marginLeft: 8 }}>
                        {formatFileSize((doc as Record<string, unknown>).fileSizeBytes as number | null | undefined)}
                      </span>
                      {(doc as Record<string, unknown>).duplicateOfId ? (
                        <Link
                          href={`/documents/${String((doc as Record<string, unknown>).duplicateOfId)}`}
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            background: statusColors.processing.bg,
                            color: statusColors.processing.text,
                            textDecoration: "none",
                          }}
                          title="View original document"
                        >
                          Duplicate
                        </Link>
                      ) : null}
                      {(() => {
                        const ins = (doc as Record<string, unknown>).insuranceFields as { settlementOffer?: number | null } | null | undefined;
                        const offer = ins?.settlementOffer;
                        if (offer != null && Number.isFinite(offer)) {
                          return (
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontWeight: 600,
                                background: "#e3f2fd",
                                color: "#1565c0",
                              }}
                              title="Settlement offer detected"
                            >
                              Offer: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(offer)}
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {(() => {
                        const risks = (doc as Record<string, unknown>).risks as { type: string; severity: string }[] | undefined;
                        if (Array.isArray(risks) && risks.length > 0) {
                          return (
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: statusColors.warning.bg,
                                color: statusColors.warning.text,
                                fontWeight: 600,
                              }}
                              title={risks.map((r) => `${r.type.replace(/_/g, " ")} (${r.severity})`).join(", ")}
                            >
                              ⚠ {risks.length} risk{risks.length !== 1 ? "s" : ""}
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {(() => {
                        const insights = (doc as Record<string, unknown>).insights as { type: string; severity: string }[] | undefined;
                        if (Array.isArray(insights) && insights.length > 0) {
                          return (
                            <span
                              style={{
                                fontSize: 11,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: statusColors.success.bg,
                                color: statusColors.success.text,
                                fontWeight: 600,
                              }}
                              title={insights.map((r) => `${r.type.replace(/_/g, " ")} (${r.severity})`).join(", ")}
                            >
                              💡 {insights.length} insight{insights.length !== 1 ? "s" : ""}
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {(() => {
                        const docType = (doc as Record<string, unknown>).docType as string | null | undefined;
                        if (!docType) return null;
                        if (docType.startsWith("court_") && !features.court_extraction) return null;
                        if (docType.startsWith("insurance_") && !features.insurance_extraction) return null;
                        const label =
                          docType.startsWith("court_")
                            ? docType.replace("court_", "Court: ").replace(/_/g, " ")
                            : docType.startsWith("insurance_")
                              ? docType.replace("insurance_", "Insurance: ").replace(/_/g, " ")
                              : docType.replace(/_/g, " ");
                        return (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: docType.startsWith("court_")
                                ? "#e8eaf6"
                                : docType.startsWith("insurance_")
                                  ? statusColors.processing.bg
                                  : "#f5f5f5",
                              color: "#333",
                            }}
                          >
                            {label}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    {formatAge(createdAt)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>{doc.clientName ?? "—"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {doc.suggestedCaseId ? (
                      <Link
                        href={`/cases/${doc.suggestedCaseId}`}
                        style={{ color: "#0066cc", textDecoration: "underline" }}
                      >
                        {suggestedCaseLabel(doc, allCases)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {(doc as Record<string, unknown>).matchConfidence != null
                      ? `${Math.round(Number((doc as Record<string, unknown>).matchConfidence) * 100)}%`
                      : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", maxWidth: 220 }}>
                    {doc.matchReason != null && doc.matchReason !== "" ? doc.matchReason : "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          border: "1px solid #66a",
                          borderRadius: 4,
                          cursor: "pointer",
                          background: "#eef",
                        }}
                      >
                        Preview
                      </button>
                      <ReviewActions doc={doc} cases={allCases} />
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor != null && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={loadMore}
            disabled={loadMoreLoading}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              border: "1px solid #ccc",
              borderRadius: 8,
              background: loadMoreLoading ? "#f0f0f0" : "#fff",
              cursor: loadMoreLoading ? "not-allowed" : "pointer",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {loadMoreLoading && <LoadingSpinner size={16} />}
            {loadMoreLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {previewDoc && (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setPreviewDoc(null)}
            onKeyDown={(e) => e.key === "Escape" && setPreviewDoc(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              zIndex: 1000,
            }}
            aria-label="Close preview"
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(420px, 100vw)",
              background: "#fff",
              boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
              zIndex: 1001,
              overflow: "auto",
              padding: 20,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Preview</h2>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                style={{
                  padding: "4px 10px",
                  fontSize: 14,
                  border: "1px solid #999",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: "#fff",
                }}
              >
                Close
              </button>
            </div>

            <p style={{ margin: "0 0 16px 0", fontSize: 11, color: "#888" }}>
              Shortcuts: c=confirm · r=reject · o=open · j/k=next/prev · esc=close
            </p>

            <dl style={{ margin: 0, fontSize: 14 }}>
              <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Document</dt>
              <dd style={{ margin: "4px 0 0 0" }}>{previewDoc.fileName ?? previewDoc.id}</dd>

              <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>ID</dt>
              <dd style={{ margin: "4px 0 0 0", fontFamily: "monospace", fontSize: 12 }}>{previewDoc.id}</dd>

              <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Suggested case</dt>
              <dd style={{ margin: "4px 0 0 0" }}>
                {previewDoc.suggestedCaseId ? (
                  <Link
                    href={`/cases/${previewDoc.suggestedCaseId}`}
                    style={{ color: "#0066cc", textDecoration: "underline" }}
                  >
                    {suggestedCaseLabel(previewDoc, allCases)}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>

              <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Confidence (case match)</dt>
              <dd style={{ margin: "4px 0 0 0" }}>
                {(previewDoc as Record<string, unknown>).matchConfidence != null
                  ? `${Math.round(Number((previewDoc as Record<string, unknown>).matchConfidence) * 100)}%`
                  : "—"}
              </dd>

              <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Match reason</dt>
              <dd style={{ margin: "4px 0 0 0" }}>
                {(previewDoc.matchReason ?? (previewDoc as Record<string, unknown>).match_reason) != null &&
                String(previewDoc.matchReason ?? (previewDoc as Record<string, unknown>).match_reason).trim() !== ""
                  ? String(previewDoc.matchReason ?? (previewDoc as Record<string, unknown>).match_reason)
                  : "—"}
              </dd>

              <AIExtractionPanel doc={previewDoc as Record<string, unknown>} />

              {(() => {
                const ins = (previewDoc as Record<string, unknown>).insuranceFields as
                  | { insuranceCompany?: string | null; adjusterName?: string | null; claimNumber?: string | null; settlementOffer?: number | null; policyLimits?: string | null; warnings?: string[] }
                  | null
                  | undefined;
                if (ins == null || typeof ins !== "object") return null;
                const fmt = (v: string | number | null | undefined) => (v != null && String(v).trim() !== "" ? String(v) : "—");
                const fmtUsd = (n: number | null | undefined) =>
                  n != null && Number.isFinite(n) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n) : "—";
                return (
                  <>
                    <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Insurance</dt>
                    <dd style={{ margin: "4px 0 0 0" }}>
                      <dl style={{ margin: 0, fontSize: 13 }}>
                        <dt style={{ fontWeight: 500, color: "#666", marginTop: 6 }}>Insurance company</dt>
                        <dd style={{ margin: "2px 0 0 0" }}>{fmt(ins.insuranceCompany)}</dd>
                        <dt style={{ fontWeight: 500, color: "#666", marginTop: 6 }}>Adjuster</dt>
                        <dd style={{ margin: "2px 0 0 0" }}>{fmt(ins.adjusterName)}</dd>
                        <dt style={{ fontWeight: 500, color: "#666", marginTop: 6 }}>Claim #</dt>
                        <dd style={{ margin: "2px 0 0 0" }}>{fmt(ins.claimNumber)}</dd>
                        <dt style={{ fontWeight: 500, color: "#666", marginTop: 6 }}>Settlement offer</dt>
                        <dd style={{ margin: "2px 0 0 0" }}>{fmtUsd(ins.settlementOffer)}</dd>
                        <dt style={{ fontWeight: 500, color: "#666", marginTop: 6 }}>Policy limits</dt>
                        <dd style={{ margin: "2px 0 0 0" }}>{fmt(ins.policyLimits)}</dd>
                        {Array.isArray(ins.warnings) && ins.warnings.length > 0 && (
                          <>
                            <dt style={{ fontWeight: 500, color: "#666", marginTop: 6 }}>Warnings</dt>
                            <dd style={{ margin: "2px 0 0 0", color: "#b45309" }}>{ins.warnings.join("; ")}</dd>
                          </>
                        )}
                      </dl>
                    </dd>
                  </>
                );
              })()}

              <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Document type confidence</dt>
              <dd style={{ margin: "4px 0 0 0" }}>
                {(previewDoc as Record<string, unknown>).docTypeConfidence != null
                  ? `${Math.round(Number((previewDoc as Record<string, unknown>).docTypeConfidence) * 100)}%`
                  : "—"}
              </dd>

              {(() => {
                const summaryPayload = (previewDoc as Record<string, unknown>).summary as
                  | { summary?: string; keyFacts?: string[] }
                  | null
                  | undefined;
                const summaryText = summaryPayload?.summary?.trim();
                const keyFacts = Array.isArray(summaryPayload?.keyFacts) ? summaryPayload.keyFacts.filter((x: unknown) => typeof x === "string" && x.trim()) : [];
                if (!summaryText && keyFacts.length === 0) return null;
                return (
                  <>
                    <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Summary</dt>
                    <dd style={{ margin: "4px 0 0 0", fontSize: 14, lineHeight: 1.5 }}>
                      {summaryText && <p style={{ margin: "0 0 8px 0" }}>{summaryText}</p>}
                      {keyFacts.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {keyFacts.map((fact: string, i: number) => (
                            <li key={i} style={{ marginBottom: 4 }}>{fact}</li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </>
                );
              })()}

              <div style={{ marginTop: 16, padding: "12px 14px", background: "#f8f9fc", borderRadius: 8, border: "1px solid #e2e6ee" }}>
                <div style={{ fontWeight: 600, marginBottom: 10, color: "#333", fontSize: 13 }}>Recommended action</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {(() => {
                    const rec = (previewDoc as Record<string, unknown>).routingRecommendation as "route" | "reject" | "review_manually" | undefined;
                    const isRoute = rec === "route";
                    const isReject = rec === "reject";
                    const isReview = rec === "review_manually";
                    return (
                      <>
                        <span
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 500,
                            background: isRoute ? statusColors.success.bg : "#f5f5f5",
                            border: isRoute ? `1px solid ${statusColors.success.border}` : "1px solid #e0e0e0",
                            color: isRoute ? statusColors.success.text : "#424242",
                          }}
                        >
                          Route
                          {isRoute && " ✓"}
                        </span>
                        <span
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 500,
                            background: isReject ? statusColors.error.bg : "#f5f5f5",
                            border: isReject ? `1px solid ${statusColors.error.border}` : "1px solid #e0e0e0",
                            color: isReject ? statusColors.error.text : "#424242",
                          }}
                        >
                          Reject
                          {isReject && " ✓"}
                        </span>
                        <span
                          style={{
                            padding: "6px 12px",
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 500,
                            background: isReview ? statusColors.warning.bg : "#f5f5f5",
                            border: isReview ? `1px solid ${statusColors.warning.border}` : "1px solid #e0e0e0",
                            color: isReview ? statusColors.warning.text : "#424242",
                          }}
                        >
                          Review manually
                          {isReview && " ✓"}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>

              {(() => {
                const risks = (previewDoc as Record<string, unknown>).risks as { type: string; severity: string }[] | undefined;
                if (!Array.isArray(risks) || risks.length === 0) return null;
                const labels: Record<string, string> = {
                  pre_existing: "Pre-existing condition",
                  degenerative: "Degenerative",
                  gap_in_treatment: "Gap in treatment",
                  liability_disputed: "Liability disputed",
                };
                return (
                  <>
                    <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Risk alerts</dt>
                    <dd style={{ margin: "4px 0 0 0" }}>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {risks.map((r, i) => (
                          <li key={i} style={{ color: r.severity === "high" ? "#b45309" : "#666", marginBottom: 4 }}>
                            <strong>{labels[r.type] ?? r.type.replace(/_/g, " ")}</strong> ({r.severity})
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </>
                );
              })()}

              {(() => {
                const insights = (previewDoc as Record<string, unknown>).insights as { type: string; severity: string }[] | undefined;
                if (!Array.isArray(insights) || insights.length === 0) return null;
                const labels: Record<string, string> = {
                  pre_existing: "Pre-existing condition",
                  degenerative: "Degenerative findings",
                  liability_dispute: "Liability dispute",
                  treatment_gap: "Treatment gap",
                  causation_language: "Causation language",
                  settlement_offer: "Settlement offer",
                  policy_limits: "Policy limits",
                };
                return (
                  <>
                    <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Document insights</dt>
                    <dd style={{ margin: "4px 0 0 0" }}>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {insights.map((r, i) => (
                          <li key={i} style={{ color: r.severity === "high" ? "#2e7d32" : "#666", marginBottom: 4 }}>
                            <strong>{labels[r.type] ?? r.type.replace(/_/g, " ")}</strong> ({r.severity})
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </>
                );
              })()}

              <dt style={{ fontWeight: 600, marginTop: 12, color: "#555" }}>Extracted fields</dt>
              <dd style={{ margin: "4px 0 0 0" }}>
                {(() => {
                  const raw =
                    (previewDoc as Record<string, unknown>).extractedFields ??
                    (previewDoc as Record<string, unknown>).extracted_fields;
                  if (raw == null) return "—";
                  try {
                    const str = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
                    return (
                      <pre style={{ margin: 0, fontSize: 12, overflow: "auto", background: "#f5f5f5", padding: 10, borderRadius: 4 }}>
                        {str}
                      </pre>
                    );
                  } catch {
                    return "—";
                  }
                })()}
              </dd>
            </dl>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eee" }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#555" }}>Preview</div>
              {previewImageError ? (
                <p style={{ fontSize: 12, color: "#666", margin: 0 }}>No preview available.</p>
              ) : (
                <img
                  src={`/api/documents/${previewDoc.id}/preview?page=1&size=large`}
                  alt=""
                  onError={() => setPreviewImageError(true)}
                  style={{
                    width: "100%",
                    maxHeight: 260,
                    objectFit: "contain",
                    borderRadius: 4,
                    background: "#f5f5f5",
                  }}
                />
              )}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eee" }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#555" }}>Route to…</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <select
                  value={drawerRouteCaseId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDrawerRouteCaseId(v);
                    setLastDrawerRouteCaseId(v);
                  }}
                  style={{
                    padding: "6px 10px",
                    fontSize: 13,
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    minWidth: 200,
                  }}
                  aria-label="Select case to route to"
                >
                  <option value="">Select a case</option>
                  {allCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caseNumber} – {c.title ?? ""} {c.clientName ? `(${c.clientName})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleDrawerReroute(previewDoc, drawerRouteCaseId)}
                  disabled={previewLoading || !drawerRouteCaseId.trim()}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    border: "1px solid #66a",
                    borderRadius: 4,
                    cursor: previewLoading || !drawerRouteCaseId.trim() ? "not-allowed" : "pointer",
                    background: "#eef",
                  }}
                >
                  Route
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
              {(() => {
                const conf = (previewDoc as Record<string, unknown>).matchConfidence as number | null | undefined;
                const isLowConfidence = conf != null && Number(conf) < MIN_CONFIRM_CONFIDENCE;
                const needSecondClick = isLowConfidence && !drawerConfirmAcknowledged;
                const claimedBy = (previewDoc as Record<string, unknown>).claimedBy as string | null | undefined;
                const isClaimedByOther =
                  claimedBy != null && String(claimedBy).trim() !== "" && String(claimedBy) !== CURRENT_REVIEW_USER;
                return (
                  <>
                    {claimedBy != null && String(claimedBy).trim() !== "" && (
                      <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#555" }}>
                        Claimed by {String(claimedBy) === CURRENT_REVIEW_USER ? "you" : claimedBy}
                      </p>
                    )}
                    {isLowConfidence && !drawerConfirmAcknowledged && (
                      <p style={{ width: "100%", margin: 0, fontSize: 12, color: "#b85c00", background: "#fff8e6", padding: 8, borderRadius: 4 }}>
                        Confidence is below {Math.round(MIN_CONFIRM_CONFIDENCE * 100)}%. Click again to confirm anyway.
                      </p>
                    )}
                    <Link
                      href={`/documents/${previewDoc.id}`}
                      style={{
                        padding: "8px 14px",
                        fontSize: 13,
                        border: "1px solid #06c",
                        borderRadius: 4,
                        color: "#06c",
                        textDecoration: "none",
                        background: "#fff",
                      }}
                    >
                      Open document
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (needSecondClick) {
                          setDrawerConfirmAcknowledged(true);
                          return;
                        }
                        handleDrawerConfirm(previewDoc);
                      }}
                      disabled={previewLoading || !previewDoc.suggestedCaseId || isClaimedByOther}
                      style={{
                        padding: "8px 14px",
                        fontSize: 13,
                        border: `1px solid ${statusColors.success.border}`,
                        borderRadius: 4,
                        cursor: previewLoading || !previewDoc.suggestedCaseId ? "not-allowed" : "pointer",
                        background: statusColors.success.bg,
                      }}
                    >
                      {isLowConfidence && drawerConfirmAcknowledged ? "Confirm anyway" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDrawerReject(previewDoc)}
                      disabled={previewLoading || isClaimedByOther}
                      style={{
                        padding: "8px 14px",
                        fontSize: 13,
                        border: `1px solid ${statusColors.error.border}`,
                        borderRadius: 4,
                        cursor: previewLoading ? "not-allowed" : "pointer",
                        background: statusColors.error.bg,
                      }}
                    >
                      Reject
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {toastMessage != null && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 16px",
            fontSize: 13,
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 1002,
            display: "flex",
            alignItems: "center",
            gap: 12,
            maxWidth: "min(400px, 90vw)",
            background: toastType === "success" ? statusColors.success.bg : statusColors.error.bg,
            border: toastType === "success" ? `1px solid ${statusColors.success.border}` : `1px solid ${statusColors.error.border}`,
            color: toastType === "success" ? statusColors.success.text : statusColors.error.text,
          }}
        >
          <span style={{ flex: 1 }}>{toastMessage}</span>
          {toastType === "error" && (
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              style={{
                padding: "2px 8px",
                fontSize: 12,
                border: `1px solid ${statusColors.error.border}`,
                borderRadius: 4,
                cursor: "pointer",
                background: "transparent",
                color: statusColors.error.text,
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </>
  );
}
