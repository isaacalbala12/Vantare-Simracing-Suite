type StudioSectionCardProps = {
  title: string;
  description: string;
  meta: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
};

export function StudioSectionCard({
  title,
  description,
  meta,
  action,
  onClick,
  disabled = false,
}: StudioSectionCardProps) {
  return (
    <button
      type="button"
      aria-label={`Abrir ${title}`}
      onClick={onClick}
      disabled={disabled}
      className="group card-sleek min-h-[220px] rounded-xl p-6 text-left transition-colors hover:border-vantare-red-500/45 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-vantare-red-500/60 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
    >
      <div className="flex h-full flex-col justify-between gap-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-vantare-red-300">
            {meta}
          </p>
          <h2 className="mt-4 font-display text-2xl font-bold text-white">{title}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-vantare-textMuted">
            {description}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-white/80">
            {action}
          </span>
          <span className="text-xl text-vantare-red-300 transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>
    </button>
  );
}
