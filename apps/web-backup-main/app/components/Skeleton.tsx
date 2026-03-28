export function SkeletonBar({
  width = "100%",
  height = 14,
}: {
  width?: string | number;
  height?: number;
}) {
  return (
    <div
      style={{
        height,
        background: "#e5e5e5",
        borderRadius: 4,
        width: typeof width === "number" ? `${width}px` : width,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <SkeletonBar width="40%" />
      <div style={{ marginTop: 10 }}>
        <SkeletonBar width="70%" />
      </div>
      <div style={{ marginTop: 8 }}>
        <SkeletonBar width="55%" />
      </div>
    </div>
  );
}
