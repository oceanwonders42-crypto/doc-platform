/**
 * Create or update TrafficMatter from extraction results.
 * Matches by citation number, defendant, jurisdiction, issue date proximity.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import type { TrafficCitationExtracted } from "../ai/extractors/trafficCitationExtractor";
import {
  type StatuteExtractionResult,
  normalizeTrafficStatuteCode,
} from "../ai/extractors/trafficStatuteExtractor";

export interface CreateOrUpdateTrafficMatterInput {
  firmId: string;
  sourceDocumentId: string;
  documentTypeOfOrigin: string | null;
  citationFields: TrafficCitationExtracted;
  citationConfidence: Record<string, number>;
  statuteResult: StatuteExtractionResult;
  routingConfidence: number;
  reviewRequired: boolean;
}

function parseDateSafe(s: string | null): Date | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

function toNullableJsonValue(value: Prisma.InputJsonValue | null): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (value === null) return Prisma.JsonNull;
  return value;
}

function daysDiff(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000)));
}

export async function findMatchingTrafficMatter(
  firmId: string,
  citationNumber: string | null,
  defendantName: string | null,
  jurisdictionState: string | null,
  issueDate: Date | null
): Promise<{ id: string; matchStrength: "strong" | "weak" | "none" } | null> {
  if (!citationNumber || !citationNumber.trim()) {
    if (!defendantName?.trim() || !jurisdictionState?.trim()) return null;
    const byDefendant = await prisma.trafficMatter.findFirst({
      where: {
        firmId,
        defendantName: defendantName.trim(),
        jurisdictionState: jurisdictionState.trim(),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!byDefendant) return null;
    if (issueDate && byDefendant.issueDate) {
      const diff = daysDiff(issueDate, byDefendant.issueDate);
      return diff <= 31
        ? { id: byDefendant.id, matchStrength: "weak" }
        : null;
    }
    return { id: byDefendant.id, matchStrength: "weak" };
  }

  const byCitation = await prisma.trafficMatter.findFirst({
    where: { firmId, citationNumber: citationNumber.trim() },
  });
  if (byCitation) return { id: byCitation.id, matchStrength: "strong" };

  if (defendantName?.trim() && jurisdictionState?.trim()) {
    const byDefendant = await prisma.trafficMatter.findFirst({
      where: {
        firmId,
        defendantName: defendantName.trim(),
        jurisdictionState: jurisdictionState.trim(),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!byDefendant) return null;
    if (issueDate && byDefendant.issueDate) {
      const diff = daysDiff(issueDate, byDefendant.issueDate);
      if (diff <= 14) return { id: byDefendant.id, matchStrength: "weak" };
    }
    return null;
  }

  return null;
}

export async function createOrUpdateTrafficMatter(
  input: CreateOrUpdateTrafficMatterInput
): Promise<{ id: string; created: boolean }> {
  const {
    firmId,
    sourceDocumentId,
    documentTypeOfOrigin,
    citationFields,
    citationConfidence,
    statuteResult,
    routingConfidence,
    reviewRequired,
  } = input;

  const issueDate = parseDateSafe(citationFields.issueDate);
  const dueDate = parseDateSafe(citationFields.dueDate);
  const hearingDate = parseDateSafe(citationFields.hearingDate);

  const existing = await findMatchingTrafficMatter(
    firmId,
    citationFields.citationNumber,
    citationFields.defendantName,
    citationFields.jurisdictionState,
    issueDate
  );

  const status = reviewRequired ? "REVIEW_REQUIRED" : "NEW_CITATION";
  const chargeListJson: Prisma.InputJsonValue | null = citationFields.chargeDescriptionRaw
    ? [{ description: citationFields.chargeDescriptionRaw }]
    : null;

  const data = {
    firmId,
    sourceDocumentId,
    documentTypeOfOrigin: documentTypeOfOrigin ?? null,
    defendantName: citationFields.defendantName ?? null,
    citationNumber: citationFields.citationNumber ?? null,
    statuteCodeRaw: statuteResult.statuteCodeRaw ?? null,
    statuteCodeNormalized:
      statuteResult.statuteCodeNormalized ??
      normalizeTrafficStatuteCode(
        statuteResult.statuteCodeRaw,
        citationFields.jurisdictionState
      ),
    chargeDescriptionRaw: citationFields.chargeDescriptionRaw ?? null,
    chargeListJson: toNullableJsonValue(chargeListJson),
    chargeListJson: toNullableJsonValue(chargeListJson),
    jurisdictionState: citationFields.jurisdictionState ?? null,
    jurisdictionCounty: citationFields.jurisdictionCounty ?? null,
    courtName: citationFields.courtName ?? null,
    courtType: citationFields.courtType ?? null,
    issueDate,
    dueDate,
    hearingDate,
    extractedFactsJson: citationFields as unknown as Prisma.InputJsonValue,
    extractionConfidenceJson: citationConfidence as Prisma.InputJsonValue,
    routingConfidence,
    reviewRequired,
    status,
    updatedAt: new Date(),
  };

  if (existing && existing.matchStrength === "strong") {
    await prisma.trafficMatter.update({
      where: { id: existing.id },
      data: { ...data, sourceDocumentId },
    });
    return { id: existing.id, created: false };
  }

  if (existing && existing.matchStrength === "weak" && !reviewRequired) {
    await prisma.trafficMatter.update({
      where: { id: existing.id },
      data: { ...data, reviewRequired: true, status: "REVIEW_REQUIRED" },
    });
    return { id: existing.id, created: false };
  }

  const created = await prisma.trafficMatter.create({
    data: {
      ...data,
    },
  });
  return { id: created.id, created: true };
}
