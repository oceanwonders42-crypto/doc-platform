/**
 * Regression tests for packet ZIP entry filename normalization.
 * Run: pnpm -C apps/api exec tsx src/services/casePacketExportNaming.test.ts
 */
import { buildPacketEntryFileName, type PacketEntryDocument } from "./casePacketExportNaming";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function makeDoc(overrides: Partial<PacketEntryDocument>): PacketEntryDocument {
  return {
    id: overrides.id ?? "doc-1",
    originalName: overrides.originalName ?? "document.pdf",
    mimeType: overrides.mimeType ?? "application/pdf",
    exportFileName: overrides.exportFileName,
  };
}

console.log("casePacketExportNaming tests");

const preservesPdf = buildPacketEntryFileName(
  makeDoc({ exportFileName: "demo-doc-1.pdf", originalName: "source.pdf", mimeType: "application/pdf" })
);
assert(preservesPdf === "demo-doc-1.pdf", "expected existing .pdf to stay .pdf, got " + preservesPdf);
assert(!preservesPdf.toLowerCase().includes(".pdf.pdf"), "existing .pdf should not double");
console.log("  ✓ preserves existing .pdf");

const preservesUppercasePdf = buildPacketEntryFileName(
  makeDoc({ exportFileName: "DEMO-DOC-1.PDF", originalName: "source.PDF", mimeType: "application/pdf" })
);
assert(preservesUppercasePdf === "DEMO-DOC-1.PDF", "expected uppercase .PDF to be preserved, got " + preservesUppercasePdf);
assert(!preservesUppercasePdf.toLowerCase().includes(".pdf.pdf"), "uppercase .PDF should not double");
console.log("  ✓ preserves existing uppercase .PDF");

const addsPdfFromOriginal = buildPacketEntryFileName(
  makeDoc({ exportFileName: "demo-doc-1", originalName: "source.pdf", mimeType: "application/pdf" })
);
assert(addsPdfFromOriginal === "demo-doc-1.pdf", "expected .pdf from originalName, got " + addsPdfFromOriginal);
assert(!addsPdfFromOriginal.toLowerCase().includes(".pdf.pdf"), "derived .pdf should not double");
console.log("  ✓ appends .pdf once from originalName when export name lacks extension");

const addsPngFromOriginal = buildPacketEntryFileName(
  makeDoc({ exportFileName: "chart", originalName: "scan.png", mimeType: "image/png" })
);
assert(addsPngFromOriginal === "chart.png", "expected .png from originalName, got " + addsPngFromOriginal);
assert(!addsPngFromOriginal.toLowerCase().includes(".png.png"), "derived .png should not double");
console.log("  ✓ appends .png once from originalName when export name lacks extension");

const fallsBackToMimeType = buildPacketEntryFileName(
  makeDoc({ exportFileName: "scan", originalName: "source", mimeType: "image/png" })
);
assert(fallsBackToMimeType === "scan.png", "expected .png from mimeType fallback, got " + fallsBackToMimeType);
assert(!fallsBackToMimeType.toLowerCase().includes(".png.png"), "mimeType fallback should not double");
console.log("  ✓ falls back to mimeType extension once when originalName lacks extension");

const preservesNonPdfExtension = buildPacketEntryFileName(
  makeDoc({ exportFileName: "photo.jpeg", originalName: "source.png", mimeType: "image/jpeg" })
);
assert(preservesNonPdfExtension === "photo.jpeg", "expected existing non-PDF extension to be preserved, got " + preservesNonPdfExtension);
assert(!preservesNonPdfExtension.toLowerCase().includes(".jpeg.jpeg"), "existing non-PDF extension should not double");
console.log("  ✓ preserves existing non-PDF extension");

const noDoublePng = buildPacketEntryFileName(
  makeDoc({ exportFileName: "photo.png", originalName: "source.png", mimeType: "image/png" })
);
assert(noDoublePng === "photo.png", "expected existing .png to stay .png, got " + noDoublePng);
assert(!noDoublePng.toLowerCase().includes(".png.png"), "existing .png should not double");
console.log("  ✓ does not produce doubled .png extensions");

console.log("All casePacketExportNaming tests passed");
