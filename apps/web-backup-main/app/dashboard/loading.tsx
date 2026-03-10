import { SkeletonBar, SkeletonCard } from "../components/Skeleton";

export default function DashboardLoading() {
  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system" }}>
      <div style={{ marginBottom: 8 }}>
        <SkeletonBar width={280} height={28} />
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
        <SkeletonBar width={50} />
        <SkeletonBar width={90} />
        <SkeletonBar width={85} />
        <SkeletonBar width={55} />
        <SkeletonBar width={45} />
        <SkeletonBar width={55} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <SkeletonBar width={300} />
      </div>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </section>
      <section style={{ marginBottom: 28 }}>
        <div style={{ marginBottom: 12 }}>
          <SkeletonBar width={140} height={20} />
        </div>
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            padding: 14,
            background: "#fafafa",
            maxWidth: 400,
          }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <SkeletonBar width="70%" height={14} />
              <div style={{ marginTop: 6 }}>
                <SkeletonBar width="40%" height={11} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{ marginBottom: 28 }}>
        <div style={{ marginBottom: 12 }}>
          <SkeletonBar width={180} height={20} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: 14,
                background: "#fafafa",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <SkeletonBar width={120} />
                <SkeletonBar width={24} height={18} />
              </div>
              <SkeletonBar width="100%" />
              <SkeletonBar width="80%" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
