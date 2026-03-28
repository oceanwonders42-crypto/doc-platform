"use client";

import { useState, useCallback } from "react";

function CopyButton({
  value,
  onCopy,
}: {
  value: string;
  onCopy: (message: string) => void;
}) {
  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      onCopy("Copied!");
    } catch {
      onCopy("Failed to copy");
    }
  }, [value, onCopy]);

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        marginLeft: 8,
        padding: "2px 8px",
        fontSize: 12,
        border: "1px solid #ccc",
        borderRadius: 6,
        background: "#fff",
        color: "#555",
        cursor: "pointer",
      }}
    >
      Copy
    </button>
  );
}

export default function ProviderContactSection({
  phone,
  fax,
  email,
  city,
  state,
}: {
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  city: string;
  state: string;
}) {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }, []);

  return (
    <>
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>
          <div>
            {city}, {state}
          </div>
          {phone && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <strong>Phone:</strong>{" "}
              <span style={{ marginRight: 4 }}>{phone}</span>
              <CopyButton value={phone} onCopy={showToast} />
            </div>
          )}
          {fax && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <strong>Fax:</strong>{" "}
              <span style={{ marginRight: 4 }}>{fax}</span>
              <CopyButton value={fax} onCopy={showToast} />
            </div>
          )}
          {email && (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <strong>Email:</strong>{" "}
              <span style={{ marginRight: 4 }}>{email}</span>
              <CopyButton value={email} onCopy={showToast} />
            </div>
          )}
          {!phone && !fax && !email && (
            <div style={{ color: "#666" }}>No phone/fax/email.</div>
          )}
        </div>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 500,
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            color: "#1b5e20",
            borderRadius: 8,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            zIndex: 9999,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
