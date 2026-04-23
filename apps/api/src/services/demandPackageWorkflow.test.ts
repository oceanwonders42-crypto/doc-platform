import "dotenv/config";

import assert from "node:assert/strict";

import { prisma } from "../db/prisma";
import { buildDemandPackageReadinessSnapshot } from "./demandPackageWorkflow";

async function main() {
  const suffix = Date.now();
  const firmId = `demand-workflow-firm-${suffix}`;
  const caseId = `demand-workflow-case-${suffix}`;
  const documentId = `demand-workflow-doc-${suffix}`;
  const providerId = `demand-workflow-provider-${suffix}`;

  await prisma.firm.create({
    data: {
      id: firmId,
      name: "Demand Workflow Test Firm",
      features: ["demand_narratives"],
    },
  });

  await prisma.legalCase.create({
    data: {
      id: caseId,
      firmId,
      title: "Workflow Matter",
      caseNumber: `WF-${suffix}`,
      clientName: "Willa Flow",
    },
  });

  try {
    const incomplete = await buildDemandPackageReadinessSnapshot(caseId, firmId);
    assert.equal(incomplete.suggestedTitle, "Willa Flow Demand Package");
    assert.equal(incomplete.stats.documentCount, 0);
    assert.equal(incomplete.stats.timelineEventCount, 0);
    assert(
      incomplete.warnings.some((warning) => warning.includes("No routed case documents")),
      "Expected readiness warnings to flag missing documents."
    );
    assert(
      incomplete.warnings.some((warning) => warning.includes("Chronology has not been built")),
      "Expected readiness warnings to flag missing chronology."
    );

    await prisma.provider.create({
      data: {
        id: providerId,
        firmId,
        name: "Workflow Therapy",
        address: "123 Main St",
        city: "New York",
        state: "NY",
      },
    });
    await prisma.caseProvider.create({
      data: {
        firmId,
        caseId,
        providerId,
      },
    });
    await prisma.caseSummary.create({
      data: {
        firmId,
        caseId,
        body: "Condensed execution summary",
      },
    });
    await prisma.caseFinancial.create({
      data: {
        firmId,
        caseId,
        medicalBillsTotal: 15000,
        settlementOffer: 25000,
      },
    });
    await prisma.document.create({
      data: {
        id: documentId,
        firmId,
        source: "upload",
        spacesKey: `tests/${documentId}.pdf`,
        originalName: "workflow.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        status: "UPLOADED",
        processingStage: "complete",
        routedCaseId: caseId,
      },
    });
    await prisma.caseTimelineEvent.create({
      data: {
        firmId,
        caseId,
        documentId,
        track: "medical",
        eventType: "treatment",
      },
    });

    const complete = await buildDemandPackageReadinessSnapshot(caseId, firmId);
    assert.equal(complete.stats.documentCount, 1);
    assert.equal(complete.stats.timelineEventCount, 1);
    assert.equal(complete.stats.providerCount, 1);
    assert.equal(complete.stats.hasCaseSummary, true);
    assert.equal(complete.stats.hasMedicalBills, true);
    assert.equal(complete.stats.hasSettlementOffer, true);
    assert.equal(
      complete.warnings.some((warning) => warning.includes("No routed case documents")),
      false
    );

    console.log("demandPackageWorkflow tests passed");
  } finally {
    await prisma.caseTimelineEvent.deleteMany({ where: { caseId, firmId } }).catch(() => undefined);
    await prisma.document.deleteMany({ where: { id: documentId } }).catch(() => undefined);
    await prisma.caseFinancial.deleteMany({ where: { caseId, firmId } }).catch(() => undefined);
    await prisma.caseSummary.deleteMany({ where: { caseId, firmId } }).catch(() => undefined);
    await prisma.caseProvider.deleteMany({ where: { caseId, firmId } }).catch(() => undefined);
    await prisma.provider.deleteMany({ where: { id: providerId } }).catch(() => undefined);
    await prisma.legalCase.deleteMany({ where: { id: caseId } }).catch(() => undefined);
    await prisma.firm.deleteMany({ where: { id: firmId } }).catch(() => undefined);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
