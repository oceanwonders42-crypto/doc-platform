export default function DashboardLoading() {
  return (
    <div className="dashboard-page" style={{ padding: "0 var(--onyx-content-padding) var(--onyx-content-padding)" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="onyx-skeleton" style={{ width: 140, height: 28, marginBottom: 6 }} />
        <div className="onyx-skeleton" style={{ width: 320, height: 18 }} />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="onyx-card" style={{ padding: "1.375rem 1.25rem", borderRadius: "var(--onyx-radius-lg)" }}>
            <div className="onyx-skeleton" style={{ width: "60%", height: 12, marginBottom: 8 }} />
            <div className="onyx-skeleton" style={{ width: 48, height: 24, marginBottom: 4 }} />
            <div className="onyx-skeleton" style={{ width: "40%", height: 10 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <div className="onyx-skeleton" style={{ width: 140, height: 36, borderRadius: "var(--onyx-radius-md)" }} />
        <div className="onyx-skeleton" style={{ width: 110, height: 36, borderRadius: "var(--onyx-radius-md)" }} />
        <div className="onyx-skeleton" style={{ width: 160, height: 36, borderRadius: "var(--onyx-radius-md)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem", maxWidth: 960 }}>
        <div className="onyx-card" style={{ padding: "1.5rem 1.375rem", borderRadius: "var(--onyx-radius-lg)" }}>
          <div className="onyx-skeleton" style={{ width: 120, height: 16, marginBottom: "1rem" }} />
          <div className="onyx-skeleton" style={{ width: "100%", height: 12, marginBottom: 10 }} />
          <div className="onyx-skeleton" style={{ width: "90%", height: 12, marginBottom: 10 }} />
          <div className="onyx-skeleton" style={{ width: "70%", height: 12 }} />
        </div>
        <div className="onyx-card" style={{ padding: "1.5rem 1.375rem", borderRadius: "var(--onyx-radius-lg)" }}>
          <div className="onyx-skeleton" style={{ width: 140, height: 16, marginBottom: "1rem" }} />
          <div className="onyx-skeleton" style={{ width: "100%", height: 80, borderRadius: "var(--onyx-radius-sm)" }} />
        </div>
      </div>
    </div>
  );
}
