import assert from "node:assert/strict";
import { buildRouteDocumentUpdateData } from "./documentRouting";

assert.deepEqual(
  buildRouteDocumentUpdateData(
    { status: "PROCESSING" },
    "case-123",
    {
      actor: "tester",
      action: "attached_to_case",
      routedSystem: "manual",
      routingStatus: "routed",
    }
  ),
  {
    routedCaseId: "case-123",
    routedSystem: "manual",
    routingStatus: "routed",
    status: "UPLOADED",
  }
);

assert.deepEqual(
  buildRouteDocumentUpdateData(
    { status: "UNMATCHED" },
    "case-456",
    {
      actor: "tester",
      action: "bulk_route",
      reviewState: "APPROVED",
      status: "UPLOADED",
    }
  ),
  {
    routedCaseId: "case-456",
    reviewState: "APPROVED",
    status: "UPLOADED",
  }
);

assert.deepEqual(
  buildRouteDocumentUpdateData(
    { status: "PROCESSING" },
    null,
    {
      actor: "tester",
      action: "unroute",
    }
  ),
  {
    routedCaseId: null,
  }
);

console.log("documentRouting.test.ts passed");
