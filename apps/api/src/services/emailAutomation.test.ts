import assert from "node:assert/strict";

import {
  extractEmailAutomationSnapshot,
  getDocumentEmailAutomation,
} from "./emailAutomation";

async function main() {
  const snapshot = extractEmailAutomationSnapshot({
    fromEmail: "adjuster@statefarm.com",
    subject: "Client: Jane Doe - Claim Number CLM-445566",
    bodyText:
      "Date of Loss: 02/14/2026\nPolicy Number: POL-778899\nInsurance Carrier: State Farm",
    attachmentFileName: "Jane_Doe_records.pdf",
    attachmentNames: ["Jane_Doe_records.pdf", "Claim-CLM-445566.pdf"],
  });

  assert(snapshot, "Expected email automation snapshot to be created");
  assert.equal(snapshot?.fields.clientName?.value, "Jane Doe");
  assert.equal(snapshot?.fields.claimNumber?.value, "CLM-445566");
  assert.equal(snapshot?.fields.policyNumber?.value, "POL-778899");
  assert.equal(snapshot?.fields.insuranceCarrier?.value, "State Farm");
  assert.equal(snapshot?.fields.dateOfLoss?.value, "02/14/2026");
  assert(
    snapshot?.matchSignals.caseNumberCandidates.includes("CLM-445566"),
    "Expected claim number to be included in case number candidates"
  );

  const roundTrip = getDocumentEmailAutomation({ emailAutomation: snapshot });
  assert(roundTrip, "Expected stored email automation snapshot to round-trip");
  assert.equal(roundTrip?.fields.claimNumber?.value, "CLM-445566");
  assert.equal(roundTrip?.fields.clientName?.value, "Jane Doe");

  console.log("emailAutomation tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
