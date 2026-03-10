"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshButton({
  label = "Refresh",
  ariaLabel = "Refresh",
}: {
  label?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function handleClick() {
    if (refreshing) return;
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 500);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={refreshing}
      aria-label={ariaLabel}
      style={{
        padding: "6px 12px",
        fontSize: 13,
        border: "1px solid #ccc",
        borderRadius: 6,
        background: refreshing ? "#f0f0f0" : "#fff",
        cursor: refreshing ? "not-allowed" : "pointer",
        fontWeight: 500,
      }}
    >
      {refreshing ? "Refreshing…" : label}
    </button>
  );
}
