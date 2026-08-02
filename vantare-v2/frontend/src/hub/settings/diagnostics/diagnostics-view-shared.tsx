import type { ReactNode } from "react";

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div
      className="min-h-28 rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-vantare-textMuted"
      role="status"
    >
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden="true"
          className="size-2 animate-pulse rounded-full bg-vantare-red-400"
        />
        {label}
      </span>
    </div>
  );
}

export function StateNotice({
  title,
  body,
  action,
  testId,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="rounded-xl border border-white/10 bg-black/20 p-4"
      data-testid={testId}
      role="status"
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-vantare-textMuted">
        {body}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
