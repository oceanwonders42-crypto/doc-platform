/**
 * Minimal unit tests for docClassifier and extractors using sample text fixtures.
 * Run: pnpm -C apps/api exec tsx src/ai/docClassifier.test.ts
 * Or: pnpm -C apps/api exec tsx src/ai/extractors/extractors.test.ts
 */
import { classify } from "./docClassifier";
import { extractCourt } from "./extractors/court";
import { extractInsurance } from "./extractors/insurance";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// --- Classifier fixtures ---
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

console.log("docClassifier + extractors tests");

// Classifier: court text -> court_filing
const courtOut = classify(COURT_FIXTURE, "notice_of_hearing.pdf");
assert(
  courtOut.docType === "court_filing",
  `Expected court_filing docType, got ${courtOut.docType}`
);
assert(courtOut.confidence >= 0.5, `Expected confidence >= 0.5, got ${courtOut.confidence}`);
console.log("  ✓ classifier: court fixture -> court_filing");

// Classifier: insurance text -> insurance_letter
const insOut = classify(INSURANCE_FIXTURE, "claim_letter.pdf");
assert(
  insOut.docType === "insurance_letter",
  `Expected insurance_letter docType, got ${insOut.docType}`
);
assert(insOut.confidence >= 0.5, `Expected confidence >= 0.5, got ${insOut.confidence}`);
console.log("  ✓ classifier: insurance fixture -> insurance_letter");

// Classifier: medical text -> medical_record
const medOut = classify(MEDICAL_FIXTURE, "records.pdf");
assert(
  medOut.docType === "medical_record" || medOut.docType === "unknown",
  `Expected medical_record or unknown, got ${medOut.docType}`
);
assert(
  medOut.docType === "medical_record" ? medOut.confidence >= 0.5 : true,
  "Expected confidence >= 0.5 when medical_record"
);
console.log("  ✓ classifier: medical fixture");

// Court extractor
const courtFields = extractCourt(COURT_FIXTURE);
assert(courtFields.caseNumber != null, "Expected caseNumber");
assert(courtFields.courtName != null || courtFields.county != null, "Expected court name or county");
console.log("  ✓ court extractor: caseNumber, court/county");

// Insurance extractor
const insFields = extractInsurance(INSURANCE_FIXTURE);
assert(insFields.claimNumber != null, "Expected claimNumber");
assert(insFields.policyNumber != null, "Expected policyNumber");
assert(insFields.letterDate != null || insFields.lossDate != null, "Expected date");
console.log("  ✓ insurance extractor: claimNumber, policyNumber, date");

console.log("All tests passed.");
