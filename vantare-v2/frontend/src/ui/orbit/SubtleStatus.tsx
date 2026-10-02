import type { ReactNode } from "react";
import { cx } from "./cx";

export interface SubtleStatusProps {
  children: ReactNode;
  tone?: "neutral" | "attn" | "ok";
  className?: string;
}

export function SubtleStatus({ children, tone = "neutral", className }: SubtleStatusProps) {
  const classes = cx("orbit-substatus", tone === "neutral" ? null : `orbit-substatus--${tone}`, className);

  return <span className={classes}>{children}</span>;
}
