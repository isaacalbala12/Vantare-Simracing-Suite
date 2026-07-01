type V52InfoCardProps = {
  label: string;
  title: string;
  body: string;
  tone?: "red" | "blue" | "green" | "amber" | "purple";
};

const DOT_CLASS: Record<NonNullable<V52InfoCardProps["tone"]>, string> = {
  red: "bg-vantare-red-400",
  blue: "bg-blue-400",
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  purple: "bg-violet-400",
};

const LABEL_CLASS: Record<NonNullable<V52InfoCardProps["tone"]>, string> = {
  red: "text-vantare-red-400",
  blue: "text-blue-400",
  green: "text-emerald-400",
  amber: "text-amber-400",
  purple: "text-violet-400",
};

export function V52InfoCard({ label, title, body, tone = "red" }: V52InfoCardProps) {
  return (
    <article className="group flex items-start gap-2.5 p-3 rounded-lg bg-[rgba(20,20,20,.5)] border border-white/5 hover:border-vantare-red-500/40 transition-colors">
      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${DOT_CLASS[tone]}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-[9px] font-bold uppercase tracking-[.18em] ${LABEL_CLASS[tone]}`}>
          {label}
        </p>
        <p className="text-xs font-semibold text-white truncate mt-0.5">{title}</p>
        <p className="text-[10px] text-vantare-textMuted mt-0.5 line-clamp-2">{body}</p>
      </div>
    </article>
  );
}
