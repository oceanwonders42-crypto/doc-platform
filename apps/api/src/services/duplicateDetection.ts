/**
 * Smart duplicate detection: exact (file_sha256), normalized text hash, and near-duplicate by similarity.
 */
import { prisma } from "../db/prisma";
import { pgPool } from "../db/pg";
import crypto from "crypto";

const NORMALIZE_MAX_LEN = 50000;
const SIMILARITY_THRESHOLD = 0.85;
const RECENT_DOCS_LIMIT = 500;

function normalizeTextForHash(text: string | null | undefined): string {
  if (text == null) return "";
  let s = String(text)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .trim();
  if (s.length > NORMALIZE_MAX_LEN) s = s.slice(0, NORMALIZE_MAX_LEN);
  return s;
}

export function computeNormalizedTextHash(text: string | null | undefined): string {
  const normalized = normalizeTextForHash(text);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** Jaccard-like word overlap similarity (0..1). */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTextForHash(a).split(/\s+/).filter(Boolean));
  const wordsB = new Set(normalizeTextForHash(b).split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export type DuplicateCandidate = {
  documentId: string;
  originalName: string;
  confidence: "strong" | "likely" | "near";
  reason: string;
  duplicateOfId?: string | null;
};

export type FindDuplicateCandidatesResult = {
  original: { id: string; originalName: string } | null;
  duplicates: Array<{ id: string; originalName: string }>;
  nearDuplicates: DuplicateCandidate[];
};

/**
 * Find duplicate and near-duplicate candidates for a document.
 * - exact file_sha256 match = strong duplicate (existing duplicateOfId)
 * - normalized_text_hash match = likely duplicate
 * - high text similarity vs recent docs = near duplicate
 */
export async function findDuplicateCandidates(
  firmId: string,
  documentId: string,
  normalizedText: string | null
): Promise<FindDuplicateCandidatesResult> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, firmId },
    select: { id: true, originalName: true, file_sha256: true, duplicateOfId: true },
  });
  if (!doc) {
    return { original: null, duplicates: [], nearDuplicates: [] };
  }

  let original: { id: string; originalName: string } | null = null;
  const duplicates: Array<{ id: string; originalName: string }> = [];
  const nearDuplicates: DuplicateCandidate[] = [];

  if (doc.duplicateOfId) {
    const orig = await prisma.document.findFirst({
      where: { id: doc.duplicateOfId, firmId },
      select: { id: true, originalName: true },
    });
    if (orig) original = { id: orig.id, originalName: orig.originalName };
  }

  const dups = await prisma.document.findMany({
    where: { firmId, duplicateOfId: documentId },
    select: { id: true, originalName: true },
    orderBy: { ingestedAt: "desc" },
  });
  duplicates.push(...dups.map((d) => ({ id: d.id, originalName: d.originalName })));

  const hash = normalizedText ? computeNormalizedTextHash(normalizedText) : null;
  if (hash) {
    const { rows: hashRows } = await pgPool.query<{ document_id: string }>(
      `select document_id from document_recognition where normalized_text_hash = $1 and document_id != $2`,
      [hash, documentId]
    );
    for (const r of hashRows) {
      const other = await prisma.document.findFirst({
        where: { id: r.document_id, firmId },
        select: { id: true, originalName: true },
      });
      if (other && !nearDuplicates.some((n) => n.documentId === other.id))
        nearDuplicates.push({
          documentId: other.id,
          originalName: other.originalName,
          confidence: "likely",
          reason: "Normalized text hash match (rescanned/renamed)",
        });
    }
  }

  if (normalizedText && normalizedText.length > 100) {
    const recentDocs = await prisma.document.findMany({
      where: { firmId, id: { not: documentId } },
      select: { id: true, originalName: true },
      orderBy: { ingestedAt: "desc" },
      take: RECENT_DOCS_LIMIT,
    });
    const docIds = recentDocs.map((d) => d.id);
    if (docIds.length > 0) {
      const { rows: recentRows } = await pgPool.query<{ document_id: string; text_excerpt: string | null }>(
        `select document_id, text_excerpt from document_recognition where document_id = any($1)`,
        [docIds]
      );
      const docMap = new Map(recentDocs.map((d) => [d.id, d]));
      for (const row of recentRows) {
        if (row.document_id === documentId || !row.text_excerpt) continue;
        const sim = textSimilarity(normalizedText, row.text_excerpt);
        if (sim >= SIMILARITY_THRESHOLD) {
          const d = docMap.get(row.document_id);
          if (d && !nearDuplicates.some((n) => n.documentId === d.id))
            nearDuplicates.push({
              documentId: d.id,
              originalName: d.originalName,
              confidence: "near",
              reason: `Text similarity ${(sim * 100).toFixed(0)}%`,
            });
        }
      }
    }
  }

  return { original, duplicates, nearDuplicates };
}
