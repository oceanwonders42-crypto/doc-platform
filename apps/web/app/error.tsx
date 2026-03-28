"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: "2rem", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>Something went wrong</h2>
      <p style={{ margin: 0, color: "var(--onyx-text-muted)", fontSize: "0.875rem" }}>{error?.message ?? "An error occurred"}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="onyx-btn-primary"
        style={{ marginTop: "1rem" }}
      >
        Try again
      </button>
    </div>
  );
}
