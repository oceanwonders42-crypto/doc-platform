export type PacketEntryDocument = {
  id: string;
  originalName: string | null;
  mimeType: string;
  exportFileName?: string | null;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w\s\-\.]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
}

function getFileExtension(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  const match = /\.([a-z0-9]{1,10})$/i.exec(trimmed);
  return match ? "." + match[1] : null;
}

function inferExtensionFromMimeType(mimeType: string | null | undefined): string {
  const normalized = (mimeType || "").toLowerCase().split(";")[0].trim();
  if (!normalized) return ".bin";
  if (normalized === "application/pdf") return ".pdf";
  if (normalized === "text/plain") return ".txt";
  if (normalized === "application/zip") return ".zip";
  if (normalized.startsWith("image/")) {
    return "." + (normalized.split("/")[1]?.split("+")[0] || "jpg");
  }
  if (normalized.startsWith("text/")) {
    return "." + (normalized.split("/")[1]?.split("+")[0] || "txt");
  }
  return ".bin";
}

export function buildPacketEntryFileName(doc: PacketEntryDocument): string {
  const preferredName = sanitizeFileName(doc.exportFileName?.trim() || doc.originalName || doc.id);
  if (getFileExtension(preferredName)) return preferredName;
  const ext = getFileExtension(doc.originalName) || inferExtensionFromMimeType(doc.mimeType);
  return `${preferredName}${ext}`;
}
