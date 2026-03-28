type SummaryCardProps = {
  label: string;
  value: number;
  tone?: "default" | "alert" | "success";
};

const tones = {
  default: "bg-white",
  alert: "bg-rose-50",
  success: "bg-emerald-50",
};

export function SummaryCard({ label, value, tone = "default" }: SummaryCardProps) {
  return (
    <div className={`rounded-3xl border border-slate-200 ${tones[tone]} p-5 shadow-panel`}>
      <p className="text-sm text-steel">{label}</p>
      <p className="mt-4 text-4xl font-semibold tracking-tight text-ink">{value}</p>
    </div>
  );
}
