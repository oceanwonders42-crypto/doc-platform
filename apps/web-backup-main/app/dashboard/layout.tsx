import DashboardSidebar from "./DashboardSidebar";
import { formatTimestamp } from "../lib/formatTimestamp";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const env = process.env.NODE_ENV === "production" ? "prod" : "dev";
  const now = formatTimestamp(new Date().toISOString());

  return (
    <div
      className="dashboard-layout"
      style={{
        display: "flex",
        minHeight: "calc(100vh - 52px)",
        background: "#fff",
      }}
    >
      <DashboardSidebar />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {children}
        <footer
          style={{
            marginTop: "auto",
            padding: "8px 24px",
            fontSize: 11,
            color: "#888",
            borderTop: "1px solid #eee",
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span>Doc Platform</span>
          <span>·</span>
          <span>{env}</span>
          <span>·</span>
          <span>{now}</span>
        </footer>
      </div>
    </div>
  );
}
