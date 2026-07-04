export type DataStatus = "ok" | "partial" | "pending";

const STATUS_LABELS: Record<DataStatus, string> = {
  ok: "DATA OK",
  partial: "DATA PARTIAL",
  pending: "DATA PENDING",
};

const STATUS_COLORS: Record<DataStatus, string> = {
  ok: "text-[#22c55e]",
  partial: "text-[#f59e0b]",
  pending: "text-vantare-textDim",
};

export function WidgetDataStatusBadge({ status }: { status: DataStatus }) {
  return (
    <span
      className={`text-[9px] font-bold uppercase tracking-widest ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
