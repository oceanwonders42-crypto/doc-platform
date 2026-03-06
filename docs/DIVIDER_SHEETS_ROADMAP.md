# Divider sheets & batch detection (roadmap)

## Goal

Detect physical “divider” sheets between documents in a scan (e.g. colored pages, QR cover sheets) to split one PDF into multiple logical documents and route them correctly.

## Options

### 1. Colored divider detection (computer vision)

- **Idea:** Detect pages that are mostly a single color (e.g. colored cardstock) and treat them as dividers, not content.
- **Limitations:** Requires image-based PDF or rendered page images; color thresholds and lighting vary; fragile without calibration.
- **TODO:** Define color thresholds, page image pipeline (render PDF page → image?), and rule for “divider vs content” (e.g. >90% single color).

### 2. QR cover sheet detection (recommended)

- **Idea:** First page of each document is a “cover sheet” with a QR code encoding matter/case id and optional metadata. Scanner produces one PDF per batch; we split on QR pages and assign each chunk to the right matter.
- **Format (proposed):**
  - QR payload: JSON or URL with query params, e.g. `{"matterId":"clio-123","caseNumber":"2024-001"}` or `https://app.example.com/r?m=clio-123&c=2024-001`.
- **Payload schema (draft):**
  - `matterId` (string, optional): external matter/case id for CRM routing.
  - `caseNumber` (string, optional): human-readable case number.
  - `clientName` (string, optional): optional override.
- **TODO:** Implement QR decode (e.g. `jsqr` or similar), scan first N pages for QR, split PDF by page ranges, create one Document per range and set `routedCaseId` / `routedSystem` from QR payload.

## Implementation order

1. Define QR payload schema and document splitting contract.
2. Add QR decoding dependency and “find QR on page” helper.
3. Add pipeline step: “split PDF by divider pages” → multiple Documents.
4. Colored divider as optional later enhancement.
