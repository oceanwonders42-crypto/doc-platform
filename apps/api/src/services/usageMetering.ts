import { prisma } from "../db/prisma";

type DemandUsageReader = Pick<typeof prisma, "demandPackage">;

export type MonthlyDemandUsage = {
  firmId: string;
  yearMonth: string;
  demandCount: number;
  windowStart: Date;
  windowEndExclusive: Date;
};

export type RecordedDemandUsage = {
  demandPackage: {
    id: string;
    firmId: string;
    caseId: string;
    status: string;
    generatedDocId: string | null;
    generatedAt: Date | null;
  };
  usage: MonthlyDemandUsage;
};

function toUtcMonthWindow(at: Date = new Date()) {
  const windowStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const windowEndExclusive = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  const yearMonth = `${windowStart.getUTCFullYear()}-${String(windowStart.getUTCMonth() + 1).padStart(2, "0")}`;
  return { yearMonth, windowStart, windowEndExclusive };
}

async function countTrueDemandsForMonth(
  client: DemandUsageReader,
  firmId: string,
  at: Date
): Promise<MonthlyDemandUsage> {
  const { yearMonth, windowStart, windowEndExclusive } = toUtcMonthWindow(at);
  const demandCount = await client.demandPackage.count({
    where: {
      firmId,
      generatedDocId: { not: null },
      generatedAt: { gte: windowStart, lt: windowEndExclusive },
    },
  });

  return {
    firmId,
    yearMonth,
    demandCount,
    windowStart,
    windowEndExclusive,
  };
}

export async function getMonthlyDemandUsage(
  firmId: string,
  at: Date = new Date()
): Promise<MonthlyDemandUsage> {
  return countTrueDemandsForMonth(prisma, firmId, at);
}

export async function recordGeneratedDemandOutput(params: {
  demandPackageId: string;
  firmId: string;
  generatedDocId: string;
  generatedAt?: Date;
  status?: string;
}): Promise<RecordedDemandUsage> {
  const generatedAt = params.generatedAt ?? new Date();

  return prisma.$transaction(async (tx) => {
    const existingDemandPackage = await tx.demandPackage.findFirst({
      where: { id: params.demandPackageId, firmId: params.firmId },
      select: {
        id: true,
        generatedAt: true,
      },
    });
    if (!existingDemandPackage) {
      throw new Error("Demand package not found for usage metering.");
    }

    const firstGeneratedAt = existingDemandPackage.generatedAt ?? generatedAt;
    const demandPackage = await tx.demandPackage.update({
      where: { id: params.demandPackageId },
      data: {
        generatedDocId: params.generatedDocId,
        generatedAt: firstGeneratedAt,
        status: params.status ?? "ready",
      },
      select: {
        id: true,
        firmId: true,
        caseId: true,
        status: true,
        generatedDocId: true,
        generatedAt: true,
      },
    });

    const usage = await countTrueDemandsForMonth(
      tx as DemandUsageReader,
      params.firmId,
      firstGeneratedAt
    );
    return { demandPackage, usage };
  });
}
