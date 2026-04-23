import assert from "node:assert/strict";

import {
  CLIO_CLAIM_NUMBER_MIN_CONFIDENCE,
  buildLocalClioSandboxWriteBackPayload,
  buildClioMatterNote,
  decideClioClaimNumberWriteBack,
  deriveClioClaimNumberCandidate,
  resolveClioWriteBackConfidence,
} from "./clioAdapter";

function main() {
  const note = buildClioMatterNote({
    fileName: "carrier-letter.pdf",
    documentId: "doc-123",
    source: "email_attachment",
    ingestedAt: new Date("2026-04-21T12:00:00.000Z"),
    docType: "insurance_letter",
    claimNumberCandidate: "clm-1234",
  });
  assert.equal(note.subject, "Onyx document ingested: carrier-letter.pdf");
  assert.equal(note.date, "2026-04-21");
  assert.match(note.detail, /High-confidence claim number candidate: CLM-1234/);
  assert.match(note.detail, /Detected type: insurance_letter/);

  const candidate = deriveClioClaimNumberCandidate({
    docType: "insurance_letter",
    confidence: CLIO_CLAIM_NUMBER_MIN_CONFIDENCE + 0.05,
    extractedFields: { claimNumber: "clm-1234" },
    insuranceFields: { claimNumber: "CLM-1234" },
  });
  assert.deepEqual(candidate, {
    claimNumber: "CLM-1234",
    confidence: CLIO_CLAIM_NUMBER_MIN_CONFIDENCE + 0.05,
  });

  const lowConfidenceCandidate = deriveClioClaimNumberCandidate({
    docType: "insurance_letter",
    confidence: CLIO_CLAIM_NUMBER_MIN_CONFIDENCE - 0.01,
    extractedFields: { claimNumber: "CLM-1234" },
    insuranceFields: { claimNumber: "CLM-1234" },
  });
  assert.equal(lowConfidenceCandidate, null);

  assert.equal(resolveClioWriteBackConfidence(0.56, 0.98), 0.98);
  assert.equal(resolveClioWriteBackConfidence(0.91, null), 0.91);

  const conflictingCandidate = deriveClioClaimNumberCandidate({
    docType: "insurance_letter",
    confidence: 0.95,
    extractedFields: { claimNumber: "CLM-1234" },
    insuranceFields: { claimNumber: "CLM-9999" },
  });
  assert.equal(conflictingCandidate, null);

  const updateDecision = decideClioClaimNumberWriteBack({
    claimNumberCustomFieldId: "42",
    candidate: { claimNumber: "CLM-1234", confidence: 0.92 },
    currentFieldValue: null,
  });
  assert.deepEqual(updateDecision, {
    action: "update",
    claimNumber: "CLM-1234",
  });

  const alreadySetDecision = decideClioClaimNumberWriteBack({
    claimNumberCustomFieldId: "42",
    candidate: { claimNumber: "CLM-1234", confidence: 0.92 },
    currentFieldValue: " clm-1234 ",
  });
  assert.deepEqual(alreadySetDecision, {
    action: "already_set",
    claimNumber: "CLM-1234",
  });

  const conflictDecision = decideClioClaimNumberWriteBack({
    claimNumberCustomFieldId: "42",
    candidate: { claimNumber: "CLM-1234", confidence: 0.92 },
    currentFieldValue: "CLM-9999",
  });
  assert.deepEqual(conflictDecision, {
    action: "conflict",
    claimNumber: "CLM-1234",
    currentValue: "CLM-9999",
  });

  const unconfiguredDecision = decideClioClaimNumberWriteBack({
    claimNumberCustomFieldId: null,
    candidate: { claimNumber: "CLM-1234", confidence: 0.92 },
    currentFieldValue: null,
  });
  assert.deepEqual(unconfiguredDecision, {
    action: "skip_unconfigured",
  });

  const noCandidateDecision = decideClioClaimNumberWriteBack({
    claimNumberCustomFieldId: "42",
    candidate: null,
    missingCandidateAction: "skip_no_candidate",
    currentFieldValue: null,
  });
  assert.deepEqual(noCandidateDecision, {
    action: "skip_no_candidate",
  });

  const sandboxPayload = buildLocalClioSandboxWriteBackPayload({
    context: {
      ok: true,
      accessToken: "sandbox-token",
      matterId: "sandbox-matter-1",
      claimNumberCustomFieldId: "claim-field-1",
      integrationId: "integration-1",
      sandbox: {
        mode: "local_case_api",
        label: "Internal smoke CASE_API sandbox",
      },
    },
    documentContext: {
      documentId: "doc-123",
      fileName: "carrier-letter.pdf",
      source: "mailbox_fixture",
      ingestedAt: new Date("2026-04-21T12:00:00.000Z"),
      extractedFields: {
        claimNumber: "CLM-1234",
        policyNumber: "POL-7788",
        insurerName: "Safe Harbor Insurance",
      },
      docType: "insurance_letter",
      confidence: 0.98,
      insuranceFields: {
        claimNumber: "CLM-1234",
        policyNumber: "POL-7788",
        insuranceCompany: "Safe Harbor Insurance",
      },
    },
    note,
    claimNumberCandidate: {
      claimNumber: "CLM-1234",
      confidence: 0.98,
    },
  });
  assert.equal(sandboxPayload.mode, "local_case_api");
  assert.equal(sandboxPayload.clioMatterId, "sandbox-matter-1");
  assert.equal(sandboxPayload.claimNumberCandidate, "CLM-1234");
  assert.equal(sandboxPayload.policyNumberCandidate, "POL-7788");
  assert.equal(sandboxPayload.insuranceCarrierCandidate, "Safe Harbor Insurance");
  assert.equal(sandboxPayload.realNetworkCall, false);

  console.log("clio adapter write-back tests passed");
}

main();
