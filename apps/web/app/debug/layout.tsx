export default function DebugAuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ fontFamily: "system-ui", padding: "1rem", maxWidth: "960px", margin: "0 auto" }}>
      {children}
    </div>
  );
}
