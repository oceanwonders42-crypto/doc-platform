# Growth Tier — Advanced Extraction

Growth adds deeper extraction on top of the stable Essential flow. Extracted fields are stored in **Document.extractedFields.growthExtraction** when the firm has the **growth_extraction** feature enabled. Weak extractions are kept safe via confidence markers and `_raw`; we do not force incomplete extractions into false precision.

---

## 1. New extraction fields (Growth)

| Section | Fields | Description |
|--------|--------|-------------|
| **providerDetails** | phone, fax, addressLine, specialty | Enriched from recognition + text patterns; when confidence is low, values are only in `_raw`. |
| **serviceDates** | primaryServiceDate, dateFrom, dateTo, source | Primary service/treatment/visit date plus optional range; source = medicalRecord \| insurance \| court \| billing \| recognition. |
| **billingSummary** | totalCharged, totalPaid, balance, currency, _fromExtractor | From medical record amount, insurance offer, or regex; _fromExtractor indicates source. |
| **organizationMetadata** | suggestedCategory, suggestedFolderName, crossDocLabel | Category (doc type), folder hint for export, and short label for cross-document grouping. |

Root-level **\_confidence** on `growthExtraction` is `"high"` \| `"medium"` \| `"low"` for the whole block. Each section can also have **\_confidence** and **\_raw** (low-confidence values stored only in _raw, not as final).

---

## 2. Where confidence / fallback is used

- **growthExtraction.ts**
  - **providerDetails**: `_confidence` = high when any value came from recognition (provider_phone, etc.); medium when from text regex only; low when only regex and we null the main fields and keep values in `_raw`.
  - **serviceDates**: high when primaryServiceDate came from medicalRecord/insurance/court; medium when from recognition or billing regex; low when only from a loose date regex (value in `_raw`).
  - **billingSummary**: high when from medicalRecord or insurance extractor; medium when from billing regex; low when we don’t treat as final and keep in `_raw`.
  - **organizationMetadata**: high when suggestedCategory (doc type) is set; otherwise medium.

- **Worker**
  - Growth extraction runs only when **hasFeature(firmId, "growth_extraction")**.
  - Result is merged into **extractedFields.growthExtraction**; existing strict mode and confidence threshold still apply to base fields (caseNumber, clientName, incidentDate, etc.); Growth adds its own confidence per section.

- **Timeline**
  - **caseTimeline.ts** uses **growthExtraction.serviceDates.primaryServiceDate** as the first choice for eventDate when present **and** `_confidence` is not `"low"`; otherwise falls back to track-based (court/insurance/medical) dates so weak data does not create misleading timeline entries. Uses **growthExtraction.billingSummary** (totalCharged, balance, totalPaid) for amount when track-based amount is null. Each timeline event stores **metadataJson** with `dateSource`, `dateUncertain`, and `providerSource` so entries are inspectable. Provider resolution uses **document_recognition.suggested_provider_id** when `provider_resolution_status === 'resolved'` before falling back to fuzzy text match.

- **Naming / export**
  - **buildDocumentNamingContext** accepts optional **growthPrimaryServiceDate**; export bundle and document export-preview pass **extractedFields.growthExtraction.serviceDates.primaryServiceDate** when available so file/folder naming uses the best service date.

---

## 3. API and payload enrichment

- **GET /me/documents**, **GET /me/review-queue**, **GET /documents/:id** already return **extractedFields**; when Growth is on, **extractedFields.growthExtraction** is present and inspectable.
- **GET /me/features** includes **growth_extraction** so the UI can show Growth-only sections or badges.
- **GET /documents/:id/export-preview** and case packet export use Growth **primaryServiceDate** for naming when recognition has no better date.

---

## 4. Files

| Item | Location |
|------|----------|
| Growth extractor | `apps/api/src/ai/extractors/growthExtraction.ts` |
| Worker wiring | `apps/api/src/workers/worker.ts` (handleExtractionJob: rec query + growth_extraction check + merge) |
| Timeline use | `apps/api/src/services/caseTimeline.ts` (eventDate + amount from growthExtraction) |
| Naming / export | `apps/api/src/services/export/namingRules.ts` (buildDocumentNamingContext 5th arg), `contract.ts`, server export-preview |
| Feature flag | `GET /me/features` → growth_extraction; `hasFeature(firmId, "growth_extraction")` |

---

## 5. Enabling Growth extraction

Add **growth_extraction** to the firm’s **Firm.features** JSON array (e.g. via admin or settings). New and reprocessed documents will then get **extractedFields.growthExtraction** populated; existing documents get it on next reprocess or re-run of extraction.
