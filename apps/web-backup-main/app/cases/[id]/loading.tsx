import { SkeletonBar, SkeletonCard } from "../../components/Skeleton";

export default function CasePageLoading() {
  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <SkeletonBar width={90} />
        <SkeletonBar width={50} />
      </div>
      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          background: "#fafafa",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <SkeletonBar width={240} height={24} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 12,
            fontSize: 14,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: 14,
                background: "#fff",
              }}
            >
              <SkeletonBar width="50%" height={12} />
              <div style={{ marginTop: 8 }}>
                <SkeletonBar width="70%" height={16} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonBar key={i} width={120} height={40} />
        ))}
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32 }}>
        <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, background: "#fff" }}>
          <SkeletonBar width={140} height={18} />
          <div style={{ marginTop: 16 }}>
            <SkeletonBar width="100%" height={80} />
          </div>
        </section>
        <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, background: "#fff" }}>
          <SkeletonBar width={120} height={18} />
          <div style={{ marginTop: 16 }}>
            <SkeletonBar width="100%" height={60} />
          </div>
        </section>
        <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, background: "#fff" }}>
          <SkeletonCard />
        </section>
        <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20, background: "#fff" }}>
          <SkeletonBar width={130} height={18} />
          <div style={{ marginTop: 16 }}>
            <SkeletonBar width="100%" height={50} />
          </div>
        </section>
      </div>
    </main>
  );
}
