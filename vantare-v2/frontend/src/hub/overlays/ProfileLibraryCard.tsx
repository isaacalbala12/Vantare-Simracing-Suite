import type { ReactNode } from "react";

type ProfileLibraryCardProps = {
  title: string;
  description: string;
  meta?: string;
  actionLabel: string;
  actionAriaLabel?: string;
  onAction: () => void;
  secondaryAction?: ReactNode;
};

export function ProfileLibraryCard({
  title,
  description,
  meta,
  actionLabel,
  actionAriaLabel,
  onAction,
  secondaryAction,
}: ProfileLibraryCardProps) {
  return (
    <article className="card-sleek rounded-xl p-5">
      <div className="flex min-h-28 flex-col justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-vantare-textMuted">{description}</p>
          {meta && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-vantare-textDim">
              {meta}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-label={actionAriaLabel}
            onClick={onAction}
            className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white"
          >
            {actionLabel}
          </button>
          {secondaryAction}
        </div>
      </div>
    </article>
  );
}
