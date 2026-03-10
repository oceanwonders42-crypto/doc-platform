"use client";

type KpiCardProps = {
  label: string;
  value: string | number;
  loading?: boolean;
  accent?: "blue" | "teal" | "default";
};

const accentStyles = {
  blue: "border-[#3B82F6]/30 bg-[#3B82F6]/10",
  teal: "border-[#14B8A6]/30 bg-[#14B8A6]/10",
  default: "border-[#2A2C2E] bg-[#181A1B]",
};

export default function DashboardKpiCard({ label, value, loading, accent = "default" }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 transition-opacity ${accentStyles[accent]} ${loading ? "animate-pulse opacity-70" : ""}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-[#B3B6BA]">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${
          accent === "teal" ? "text-[#14B8A6]" : accent === "blue" ? "text-[#3B82F6]" : "text-[#FFFFFF]"
        }`}
      >
        {loading ? "—" : value}
      </p>
    </div>
  );
}
