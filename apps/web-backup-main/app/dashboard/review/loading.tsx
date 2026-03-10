import LoadingSpinner from "../../components/LoadingSpinner";

export default function ReviewLoading() {
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <LoadingSpinner size={24} />
        <span style={{ color: "#666", fontSize: 14 }}>Loading review queue…</span>
      </div>
    </main>
  );
}
