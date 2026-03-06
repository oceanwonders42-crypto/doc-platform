#!/usr/bin/env tsx
/** Outputs a minimal PDF to stdout for smoke tests. */
import { PDFDocument, StandardFonts } from "pdf-lib";

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  page.drawText("Smoke test document", { x: 50, y: 700, size: 12, font });
  const bytes = await doc.save();
  process.stdout.write(Buffer.from(bytes));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
