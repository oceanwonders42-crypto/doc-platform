import { extractBillingStatement } from "./billing";
import { extractMedicalRecord } from "./medicalRecord";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const ER_FIXTURE = `
SYNTHETIC TEST DOCUMENT - NOT REAL DATA
Emergency Department Report - Metro General Hospital
Client Jordan Alvarez
Incident Date 2026-03-18
Presenting Complaint Jordan Alvarez presented to Metro General Hospital emergency department on 2026-03-18 after a rear-end motor vehicle collision.
Emergency physician documented cervical strain, lumbar strain, left shoulder contusion, and concussion symptoms without loss of consciousness.
`;

const BILLING_FIXTURE = `
SYNTHETIC TEST DOCUMENT - NOT REAL DATA
Billing Ledger - Combined Provider Ledger
Metro General Hospital billed $3,450.00 for emergency department evaluation on 2026-03-18.
North Bay Imaging billed $2,175.00 for cervical and lumbar MRI studies on 2026-04-02.
Seaside Spine & Rehab billed $1,260.00 for three chiropractic visits on 2026-03-25, 2026-03-29, and 2026-04-05.
A separate bill line reflects Harbor Orthopedics evaluation charge of $650.00 dated 2026-03-27, but no corresponding treatment report is included in the current uploaded records.
Total billed charges to date are $7,535.00.
`;

const medical = extractMedicalRecord(ER_FIXTURE);
assert(medical.facility === "Metro General Hospital", `Expected Metro General Hospital, got ${medical.facility}`);
assert(medical.provider === "Metro General Hospital", `Expected provider fallback to facility, got ${medical.provider}`);
assert(medical.visitDate === "2026-03-18", `Expected visit date 2026-03-18, got ${medical.visitDate}`);
assert(
  !!medical.diagnosis?.includes("cervical strain"),
  `Expected extracted diagnosis to mention cervical strain, got ${medical.diagnosis}`
);

const billing = extractBillingStatement(BILLING_FIXTURE);
assert(billing.totalBilled === "7535.00", `Expected total billed 7535.00, got ${billing.totalBilled}`);
assert(billing.lineItems.length >= 5, `Expected at least 5 extracted billing line items, got ${billing.lineItems.length}`);
assert(
  billing.lineItems.some((line) => line.providerName === "Harbor Orthopedics" && line.serviceDate === "2026-03-27"),
  "Expected Harbor Orthopedics billing line to be extracted"
);

console.log("extractors.test.ts passed");
