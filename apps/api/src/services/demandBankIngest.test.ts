import assert from "node:assert/strict";

import {
  analyzeDemandBankText,
  splitDemandBankSections,
} from "./demandBankIngest";

function main() {
  const sampleText = `
SETTLEMENT DEMAND

CLIENT: Jane Doe
Date of loss: January 5, 2025

LIABILITY
Our client was rear-ended while stopped at a traffic signal. Liability is clear.

TREATMENT CHRONOLOGY
Jane Doe treated for cervical and lumbar injuries, including a lumbar disc herniation. She completed 6 months of treatment, underwent an MRI, and later received epidural injections.

BILLS SUMMARY
Past medical expenses total $18,450.00.

SETTLEMENT DEMAND
We hereby demand $150,000 to resolve this claim.
  `.trim();

  const analysis = analyzeDemandBankText(sampleText, {
    title: "Rear-end demand",
    knownPhrases: ["Jane Doe"],
  });

  assert.equal(analysis.title, "Rear-end demand");
  assert.equal(analysis.caseType, "auto_collision");
  assert.equal(analysis.liabilityType, "rear_end_collision");
  assert.equal(analysis.templateFamily, "pre_suit_demand");
  assert.equal(analysis.mriPresent, true);
  assert.equal(analysis.injectionsPresent, true);
  assert.equal(analysis.totalBillsAmount, 18450);
  assert.equal(analysis.demandAmount, 150000);
  assert.ok(analysis.injuryTags.includes("disc injury") || analysis.injuryTags.includes("pain syndrome"));
  assert.ok(analysis.bodyPartTags.includes("neck"));
  assert.ok(analysis.bodyPartTags.includes("back"));
  assert.ok(analysis.redactedText.includes("[REDACTED_NAME]"));
  assert.ok(analysis.redactedText.includes("[DATE]"));
  assert.ok(analysis.redactedText.includes("[AMOUNT]"));

  const sections = splitDemandBankSections(sampleText, ["Jane Doe"]);
  assert.ok(sections.length >= 3);
  assert.ok(sections.some((section) => section.sectionType === "liability"));
  assert.ok(sections.some((section) => section.sectionType === "treatment_chronology"));
  assert.ok(sections.some((section) => section.sectionType === "settlement_demand"));

  console.log("demandBankIngest tests passed");
}

main();
