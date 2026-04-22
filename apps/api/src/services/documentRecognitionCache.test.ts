import assert from "node:assert/strict";

import {
  buildTaskCacheKey,
  computeDocumentExplainVariant,
  DOCUMENT_RECOGNITION_PROMPTS,
  DOCUMENT_RECOGNITION_TASKS,
  getTaskCacheStats,
  invalidateTaskCacheEntries,
  inspectTaskCache,
  isTaskCacheValid,
  resolveTaskCache,
  serializeJsonbParam,
} from "./documentRecognitionCache";

async function main() {
  const summaryKey = buildTaskCacheKey(DOCUMENT_RECOGNITION_TASKS.summary);
  let summaryCalls = 0;

  const firstSummary = await resolveTaskCache({
    extractedJson: null,
    taskKey: summaryKey,
    textHash: "hash-a",
    firmId: "firm-1",
    documentId: "doc-1",
    existingValue: null as { summary: string; keyFacts: string[] } | null,
    compute: async () => {
      summaryCalls += 1;
      return { summary: "First summary", keyFacts: ["fact-1"] };
    },
    ...DOCUMENT_RECOGNITION_PROMPTS.summary,
  });

  assert.equal(firstSummary.reused, false, "Expected first summary run to compute.");
  assert.equal(summaryCalls, 1, "Expected first summary run to compute exactly once.");
  assert.equal(
    isTaskCacheValid(firstSummary.extractedJson, summaryKey, {
      textHash: "hash-a",
      firmId: "firm-1",
      documentId: "doc-1",
      ...DOCUMENT_RECOGNITION_PROMPTS.summary,
    }),
    true,
    "Expected first summary run to persist a valid cache entry."
  );
  assert.equal(
    inspectTaskCache(firstSummary.extractedJson, summaryKey, {
      textHash: "hash-a",
      firmId: "firm-2",
      documentId: "doc-1",
      ...DOCUMENT_RECOGNITION_PROMPTS.summary,
    }).recomputeReason,
    "firm_id_mismatch",
    "Expected cache inspection to reject reuse across firms."
  );
  assert.equal(
    inspectTaskCache(firstSummary.extractedJson, summaryKey, {
      textHash: "hash-a",
      firmId: "firm-1",
      documentId: "doc-2",
      ...DOCUMENT_RECOGNITION_PROMPTS.summary,
    }).recomputeReason,
    "document_id_mismatch",
    "Expected cache inspection to reject reuse across documents."
  );

  const secondSummary = await resolveTaskCache({
    extractedJson: firstSummary.extractedJson,
    taskKey: summaryKey,
    textHash: "hash-a",
    firmId: "firm-1",
    documentId: "doc-1",
    existingValue: firstSummary.value,
    compute: async () => {
      summaryCalls += 1;
      return { summary: "Should not run", keyFacts: ["fact-2"] };
    },
    ...DOCUMENT_RECOGNITION_PROMPTS.summary,
  });

  assert.equal(secondSummary.reused, true, "Expected identical summary inputs to reuse cache.");
  assert.equal(summaryCalls, 1, "Expected identical summary inputs to skip recompute.");
  assert.deepEqual(secondSummary.value, firstSummary.value, "Expected reused summary value to stay unchanged.");

  const promptBumpSummary = await resolveTaskCache({
    extractedJson: firstSummary.extractedJson,
    taskKey: summaryKey,
    textHash: "hash-a",
    firmId: "firm-1",
    documentId: "doc-1",
    existingValue: firstSummary.value,
    compute: async () => {
      summaryCalls += 1;
      return { summary: "Prompt changed", keyFacts: ["fact-3"] };
    },
    promptVersion: "document-summary-v2",
    model: DOCUMENT_RECOGNITION_PROMPTS.summary.model,
  });

  assert.equal(promptBumpSummary.reused, false, "Expected prompt-version changes to invalidate cache.");
  assert.equal(summaryCalls, 2, "Expected prompt-version change to trigger recompute.");
  assert.equal(
    inspectTaskCache(firstSummary.extractedJson, summaryKey, {
      textHash: "hash-a",
      firmId: "firm-1",
      documentId: "doc-1",
      promptVersion: "document-summary-v2",
      model: DOCUMENT_RECOGNITION_PROMPTS.summary.model,
    }).recomputeReason,
    "prompt_version_mismatch",
    "Expected cache inspection to explain prompt-version invalidation."
  );

  const textChangeSummary = await resolveTaskCache({
    extractedJson: promptBumpSummary.extractedJson,
    taskKey: summaryKey,
    textHash: "hash-b",
    firmId: "firm-1",
    documentId: "doc-1",
    existingValue: promptBumpSummary.value,
    compute: async () => {
      summaryCalls += 1;
      return { summary: "Text changed", keyFacts: ["fact-4"] };
    },
    promptVersion: "document-summary-v2",
    model: DOCUMENT_RECOGNITION_PROMPTS.summary.model,
  });

  assert.equal(textChangeSummary.reused, false, "Expected text-hash changes to invalidate cache.");
  assert.equal(summaryCalls, 3, "Expected text-hash change to trigger recompute.");
  assert.equal(
    inspectTaskCache(promptBumpSummary.extractedJson, summaryKey, {
      textHash: "hash-b",
      firmId: "firm-1",
      documentId: "doc-1",
      promptVersion: "document-summary-v2",
      model: DOCUMENT_RECOGNITION_PROMPTS.summary.model,
    }).recomputeReason,
    "text_hash_mismatch",
    "Expected cache inspection to explain text-hash invalidation."
  );

  const explainQuestion = "What matters most here?";
  const explainKey = buildTaskCacheKey(
    DOCUMENT_RECOGNITION_TASKS.explain,
    computeDocumentExplainVariant(explainQuestion)
  );
  let explainCalls = 0;

  const firstExplain = await resolveTaskCache({
    extractedJson: null,
    taskKey: explainKey,
    textHash: "hash-explain",
    firmId: "firm-1",
    documentId: "doc-1",
    existingValue: { bullets: [] as string[] },
    compute: async () => {
      explainCalls += 1;
      return { bullets: ["First answer"] };
    },
    persistOutput: true,
    ...DOCUMENT_RECOGNITION_PROMPTS.explain,
  });

  assert.equal(firstExplain.reused, false, "Expected first explain run to compute.");
  assert.equal(explainCalls, 1, "Expected first explain run to compute exactly once.");

  const secondExplain = await resolveTaskCache({
    extractedJson: firstExplain.extractedJson,
    taskKey: explainKey,
    textHash: "hash-explain",
    firmId: "firm-1",
    documentId: "doc-1",
    existingValue: { bullets: [] as string[] },
    compute: async () => {
      explainCalls += 1;
      return { bullets: ["Should not run"] };
    },
    persistOutput: true,
    ...DOCUMENT_RECOGNITION_PROMPTS.explain,
  });

  assert.equal(secondExplain.reused, true, "Expected identical explain inputs to reuse cached output.");
  assert.equal(explainCalls, 1, "Expected identical explain inputs to skip recompute.");
  assert.deepEqual(secondExplain.value, firstExplain.value, "Expected cached explain output to be returned.");

  const explainPromptChange = await resolveTaskCache({
    extractedJson: firstExplain.extractedJson,
    taskKey: explainKey,
    textHash: "hash-explain",
    firmId: "firm-1",
    documentId: "doc-1",
    existingValue: { bullets: [] as string[] },
    compute: async () => {
      explainCalls += 1;
      return { bullets: ["Prompt changed"] };
    },
    persistOutput: true,
    promptVersion: "document-explain-v2",
    model: DOCUMENT_RECOGNITION_PROMPTS.explain.model,
  });

  assert.equal(explainPromptChange.reused, false, "Expected explain prompt-version changes to invalidate cache.");
  assert.equal(explainCalls, 2, "Expected explain prompt-version change to trigger recompute.");

  const statsBeforeInvalidation = getTaskCacheStats(firstExplain.extractedJson);
  assert.equal(statsBeforeInvalidation.taskCachePresent, true, "Expected taskCache to be present after explain caching.");
  assert.equal(statsBeforeInvalidation.taskCount, 1, "Expected one explain cache entry before invalidation.");

  const invalidatedExplain = invalidateTaskCacheEntries(firstExplain.extractedJson, DOCUMENT_RECOGNITION_TASKS.explain);
  assert.equal(invalidatedExplain.removedKeys.length, 1, "Expected explain invalidation to remove the explain cache key.");
  assert.equal(invalidatedExplain.remainingKeys.length, 0, "Expected explain invalidation to leave no cache keys.");
  assert.equal(
    inspectTaskCache(invalidatedExplain.extractedJson, explainKey, {
      textHash: "hash-explain",
      firmId: "firm-1",
      documentId: "doc-1",
      ...DOCUMENT_RECOGNITION_PROMPTS.explain,
    }).recomputeReason,
    "missing_cache",
    "Expected invalidated explain cache to report a missing-cache recompute reason."
  );

  assert.equal(
    serializeJsonbParam([{ type: "settlement_offer", severity: "high" }]),
    '[{"type":"settlement_offer","severity":"high"}]',
    "Expected array-backed cache results to serialize as JSON before raw pg writes."
  );
  assert.equal(
    serializeJsonbParam({ summary: "Cached summary", keyFacts: ["fact-1"] }),
    '{"summary":"Cached summary","keyFacts":["fact-1"]}',
    "Expected object-backed cache results to serialize as JSON before raw pg writes."
  );
  assert.equal(
    serializeJsonbParam("legacy string value"),
    '"legacy string value"',
    "Expected legacy string-backed JSON values to be preserved as valid JSON strings."
  );
  assert.equal(serializeJsonbParam(null), null, "Expected null JSON values to remain null.");

  console.log("documentRecognitionCache tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
