import { SkeletonBar } from "../components/Skeleton";

export default function RecordsRequestsLoading() {
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 960,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <SkeletonBar width={90} />
        <SkeletonBar width={160} height={24} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <SkeletonBar width={180} height={13} />
      </div>
      <div
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
            gap: 14,
            padding: "12px 14px",
            background: "#fafafa",
            borderBottom: "1px solid #eee",
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonBar key={i} width="50%" height={13} />
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
              gap: 14,
              padding: "12px 14px",
              borderBottom: "1px solid #f3f3f3",
            }}
          >
            <SkeletonBar width="60%" height={14} />
            <SkeletonBar width="70%" height={14} />
            <SkeletonBar width="40%" height={14} />
            <SkeletonBar width="50%" height={14} />
            <SkeletonBar width="50%" height={14} />
          </div>
        ))}
      </div>
    </main>
  );
}
