/**
 * Creates activity feed items for CRM-style activity feed.
 */
import { prisma } from "../db/prisma";
import { Prisma } from "@prisma/client";

export type CreateActivityFeedItemInput = {
  firmId: string;
  caseId?: string | null;
  providerId?: string | null;
  documentId?: string | null;
  type: string;
  title: string;
  meta?: Prisma.InputJsonValue;
};

export async function createActivityFeedItem(input: CreateActivityFeedItemInput): Promise<void> {
  await prisma.activityFeedItem.create({
    data: {
      firmId: input.firmId,
      caseId: input.caseId ?? undefined,
      providerId: input.providerId ?? undefined,
      documentId: input.documentId ?? undefined,
      type: input.type,
      title: input.title,
      meta: input.meta ?? undefined,
    },
  });
}

/** Fire-and-forget: log activity without awaiting. */
export function logActivity(input: CreateActivityFeedItemInput): void {
  createActivityFeedItem(input).catch((e) => console.warn("[activity-feed] create failed", e));
}
