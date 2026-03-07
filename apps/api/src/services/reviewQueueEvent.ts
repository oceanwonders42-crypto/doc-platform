import { prisma } from "../db/prisma";

/**
 * Record that a document entered the NEEDS_REVIEW queue.
 * Call when document status becomes NEEDS_REVIEW.
 */
export async function recordReviewQueueEnter(firmId: string, documentId: string): Promise<void> {
  try {
    await prisma.reviewQueueEvent.create({
      data: {
        firmId,
        documentId,
        enteredAt: new Date(),
      },
    });
  } catch (e) {
    console.warn("[reviewQueue] recordReviewQueueEnter failed", e);
  }
}

/**
 * Close the most recent open review event for this document (exitedAt null).
 * Call when document leaves NEEDS_REVIEW (routed, rejected, etc.).
 */
export async function recordReviewQueueExit(
  firmId: string,
  documentId: string,
  resolutionType: string | null
): Promise<void> {
  try {
    const open = await prisma.reviewQueueEvent.findFirst({
      where: { firmId, documentId, exitedAt: null },
      orderBy: { enteredAt: "desc" },
      select: { id: true },
    });
    if (open) {
      await prisma.reviewQueueEvent.update({
        where: { id: open.id },
        data: { exitedAt: new Date(), resolutionType },
      });
    }
  } catch (e) {
    console.warn("[reviewQueue] recordReviewQueueExit failed", e);
  }
}
