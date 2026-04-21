import assert from "node:assert/strict";

import {
  extractEmailAutomationSnapshot,
  getDocumentEmailAutomation,
} from "./emailAutomation";

async function main() {
  const snapshot = extractEmailAutomationSnapshot({
    fromEmail: "adjuster@statefarm.com",
    subject: "Client: Jane Doe - Claim Number CLM-445566",
    bodyText: "Date of Loss: 02/14/2026\nInsurance Carrier: State Farm",
    attachmentFileName: "Jane_Doe_records.pdf",
    attachmentNames: ["Jane_Doe_records.pdf", "Claim-CLM-445566.pdf"],
  });

  assert(snapshot, "Expected email automation snapshot to be created");
  assert.equal(snapshot?.version, "email_automation_v1");
  assert.equal(snapshot?.fields.clientName?.value, "Jane Doe");
  assert.equal(snapshot?.fields.claimNumber?.value, "CLM-445566");
  assert.equal(snapshot?.fields.insuranceCarrier?.value, "State Farm");
  assert.equal(snapshot?.fields.dateOfLoss?.value, "02/14/2026");
  assert(snapshot!.fields.clientName!.confidence >= 0.8, "Expected subject/body client confidence");
  assert(snapshot!.matchSignals.caseNumberCandidates.includes("CLM-445566"));
  assert(snapshot!.matchSignals.supportingSignals.includes("claim number (80%)"));
  assert(snapshot!.fields.insuranceCarrier?.sources.includes("body"));
  assert(snapshot!.fields.insuranceCarrier?.sources.includes("sender"));
  assert(!("bodyText" in snapshot!.source), "Body text should not be persisted in the snapshot");

  const fallbackSnapshot = extractEmailAutomationSnapshot({
    fromEmail: "john.doe@example.com",
    subject: "Please review attached claim packet",
    attachmentNames: ["John_Doe_DOL-01-02-2026_claim-C99881.pdf"],
  });

  assert(fallbackSnapshot, "Expected fallback snapshot to be created");
  assert.equal(fallbackSnapshot?.fields.clientName?.value, "John Doe");
  assert.equal(fallbackSnapshot?.fields.claimNumber?.value, "C99881");
  assert.equal(fallbackSnapshot?.fields.dateOfLoss?.value, "01-02-2026");
  assert(fallbackSnapshot!.fields.clientName!.sources.includes("attachment"));

  const roundTrip = getDocumentEmailAutomation({ emailAutomation: snapshot });
  assert(roundTrip, "Expected stored email automation snapshot to round-trip");
  assert.equal(roundTrip?.fields.claimNumber?.value, "CLM-445566");
  assert.equal(roundTrip?.fields.clientName?.value, "Jane Doe");
  assert.equal(roundTrip?.source.attachmentFileName, "Jane_Doe_records.pdf");

  assert.equal(
    extractEmailAutomationSnapshot({
      fromEmail: "records@example.com",
      subject: "Hello there",
      bodyText: "Just checking in.",
      attachmentNames: ["records.pdf"],
    }),
    null,
    "Expected empty-signal messages to return null"
  );

  console.log("emailAutomation tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
