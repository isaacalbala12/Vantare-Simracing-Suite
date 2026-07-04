export type AccessTier = "free" | "pro" | "tester" | "experimental";

const TIER_COLORS: Record<AccessTier, string> = {
  free: "bg-[#22c55e]",
  pro: "bg-[#ff3b3b]",
  tester: "bg-[#f59e0b]",
  experimental: "bg-[#a855f7]",
};

export function WidgetAccessBadge({ tier }: { tier: AccessTier }) {
  return (
    <span
      className={`text-[9px] font-bold uppercase tracking-widest rounded px-1.5 py-0.5 text-black ${TIER_COLORS[tier]}`}
    >
      {tier}
    </span>
  );
}
