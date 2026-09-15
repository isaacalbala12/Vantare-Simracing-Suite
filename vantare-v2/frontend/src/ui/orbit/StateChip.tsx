import type { ReactNode } from "react";
import { cx } from "./cx";

export interface StateChipProps {
  children: ReactNode;
  state: "ok" | "draft" | "warn";
  className?: string;
}

export function StateChip({ children, state, className }: StateChipProps) {
  const classes = cx("orbit-state-chip", `orbit-state-chip--${state}`, className);

  return (
    <span className={classes}>
      <i aria-hidden="true" className="orbit-state-chip__dot" />
      {children}
    </span>
  );
}
