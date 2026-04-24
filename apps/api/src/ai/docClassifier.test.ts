/**
 * Minimal unit tests for docClassifier and extractors using sample text fixtures.
 * Run: pnpm -C apps/api exec tsx src/ai/docClassifier.test.ts
 */
import { classify } from "./docClassifier";
import { extractCourt } from "./extractors/court";
import { extractInsurance } from "./extractors/insurance";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const COURT_FIXTURE = `
IN THE SUPERIOR COURT OF THE STATE OF CALIFORNIA
FOR THE COUNTY OF LOS ANGELES
CASE NO. BC123456
NOTICE OF HEARING
PLAINTIFF: John Smith
DEFENDANT: Acme Corp
YOU ARE HEREBY NOTIFIED that a hearing has been set...
`;

const INSURANCE_FIXTURE = `
CLAIM NUMBER: CLM-2024-001234
POLICY NUMBER: POL-987654
Date of Loss: 01/15/2024
We are writing regarding the above-referenced claim.
Our adjuster, Jane Doe, will contact you.
Reservation of Rights.
Letter date: 02/01/2024
`;

const MEDICAL_FIXTURE = `
Patient: John Doe
Medical Record - Discharge Summary
Diagnosis: Fracture of right tibia.
Progress note: Patient presented with pain...
`;

const SYNTHETIC_ER_FIXTURE = `
SYNTHETIC TEST DOCUMENT - NOT REAL DATA
Emergency Department Report - Metro General Hospital
Client Jordan Alvarez
Claim Number CLM-QA-240424
Policy Number POL-QA-7788
Incident Date 2026-03-18
Presenting Complaint neck pain and headache after collision.
Emergency physician documented cervical strain and lumbar strain.
`;

const SYNTHETIC_CHIRO_FIXTURE = `
SYNTHETIC TEST DOCUMENT - NOT REAL DATA
Chiropractic Progress Notes - Seaside Spine & Rehab
Client Jordan Alvarez
Claim Number CLM-QA-240424
Policy Number POL-QA-7788
Incident Date 2026-03-18
Treatment Course ongoing chiropractic care.
Provider Assessment cervical sprain/strain, lumbar sprain/strain, post-traumatic headache.
Range of motion remains reduced.
`;

const SYNTHETIC_BILLING_FIXTURE = `
SYNTHETIC TEST DOCUMENT - NOT REAL DATA
Billing Ledger - Jordan Alvarez
Client Jordan Alvarez
Incident Date 2026-03-18
Metro General Hospital billed $3,450.00 for emergency department evaluation on 2026-03-18.
North Bay Imaging billed $2,200.00 for cervical MRI on 2026-03-22.
Seaside Spine & Rehab billed $1,260.00 for three chiropractic visits on 2026-03-25, 2026-03-29, and 2026-04-05.
`;

const SYNTHETIC_INSURANCE_FIXTURE = `
Insurance Adjuster Letter - Safe Harbor Insurance
SYNTHETIC TEST DOCUMENT - NOT REAL DATA
Dear Counsel:
We acknowledge the bodily injury claim for Jordan Alvarez.
Assigned adjuster: Morgan Lee.
Claim number QA-2026-0418.
Policy number SH-88421-FL.
Please provide complete treatment records and billing.
`;

console.log("docClassifier + extractors tests");

const courtOut = classify(COURT_FIXTURE, "notice_of_hearing.pdf");
assert(courtOut.docType === "court_filing", `Expected court_filing docType, got ${courtOut.docType}`);
assert(courtOut.confidence >= 0.5, `Expected confidence >= 0.5, got ${courtOut.confidence}`);
console.log("  classifier: court fixture -> court_filing");

const insOut = classify(INSURANCE_FIXTURE, "claim_letter.pdf");
assert(insOut.docType === "insurance_letter", `Expected insurance_letter docType, got ${insOut.docType}`);
assert(insOut.confidence >= 0.5, `Expected confidence >= 0.5, got ${insOut.confidence}`);
console.log("  classifier: insurance fixture -> insurance_letter");

const medOut = classify(MEDICAL_FIXTURE, "records.pdf");
assert(medOut.docType === "medical_record", `Expected medical_record, got ${medOut.docType}`);
assert(medOut.confidence >= 0.5, `Expected confidence >= 0.5, got ${medOut.confidence}`);
console.log("  classifier: medical fixture -> medical_record");

const syntheticErOut = classify(SYNTHETIC_ER_FIXTURE, "01_er_report.pdf");
assert(
  syntheticErOut.docType === "medical_record",
  `Expected synthetic ER report to classify as medical_record, got ${syntheticErOut.docType}`
);
console.log("  classifier: synthetic ER report -> medical_record");

const syntheticChiroOut = classify(SYNTHETIC_CHIRO_FIXTURE, "03_chiropractic_notes.pdf");
assert(
  syntheticChiroOut.docType === "medical_record",
  `Expected synthetic chiropractic notes to classify as medical_record, got ${syntheticChiroOut.docType}`
);
console.log("  classifier: synthetic chiropractic notes -> medical_record");

const syntheticBillingOut = classify(SYNTHETIC_BILLING_FIXTURE, "04_billing_ledger.pdf");
assert(
  syntheticBillingOut.docType === "billing_statement",
  `Expected synthetic billing ledger to classify as billing_statement, got ${syntheticBillingOut.docType}`
);
console.log("  classifier: synthetic billing ledger -> billing_statement");

const syntheticInsuranceOut = classify(SYNTHETIC_INSURANCE_FIXTURE, "05_insurance_adjuster_letter.pdf");
assert(
  syntheticInsuranceOut.docType === "insurance_letter",
  `Expected synthetic insurance letter to classify as insurance_letter, got ${syntheticInsuranceOut.docType}`
);
console.log("  classifier: synthetic insurance letter -> insurance_letter");

const courtFields = extractCourt(COURT_FIXTURE);
assert(courtFields.caseNumber != null, "Expected caseNumber");
assert(courtFields.courtName != null || courtFields.county != null, "Expected court name or county");
console.log("  court extractor: caseNumber, court/county");

const insFields = extractInsurance(INSURANCE_FIXTURE);
assert(insFields.claimNumber != null, "Expected claimNumber");
assert(insFields.policyNumber != null, "Expected policyNumber");
assert(insFields.letterDate != null || insFields.lossDate != null, "Expected date");
console.log("  insurance extractor: claimNumber, policyNumber, date");

console.log("All tests passed.");
