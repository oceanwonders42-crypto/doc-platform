import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ActivityInput = {
  projectId?: string | null;
  taskId?: string | null;
  type: string;
  message: string;
  metadata?: Record<string, unknown> | null;
};

export async function logActivity(input: ActivityInput) {
  return prisma.activityLog.create({
    data: {
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      type: input.type,
      message: input.message,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
