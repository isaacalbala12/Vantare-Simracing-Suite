import type { ReactNode } from "react";

export interface StateChipProps {
  children: ReactNode;
  state: "ok" | "draft" | "warn";
  className?: string;
}

export function StateChip({ children, state, className }: StateChipProps) {
  const classes = ["orbit-state-chip", `orbit-state-chip--${state}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      <i aria-hidden="true" className="orbit-state-chip__dot" />
      {children}
    </span>
  );
}
