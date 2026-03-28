function getFileType(filename: string): "pdf" | "image" | "unknown" {
  const ext = (filename || "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "svg"].includes(ext)) return "image";
  return "unknown";
}

const iconStyle = { width: 18, height: 18, flexShrink: 0 };

export default function FileTypeIcon({ filename }: { filename: string }) {
  const type = getFileType(filename);

  if (type === "pdf") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={iconStyle} aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h1" />
        <path d="M12 13h6" />
        <path d="M8 17h6" />
      </svg>
    );
  }

  if (type === "image") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={iconStyle} aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={iconStyle} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 18v-6" />
      <path d="M9 15h6" />
    </svg>
  );
}
