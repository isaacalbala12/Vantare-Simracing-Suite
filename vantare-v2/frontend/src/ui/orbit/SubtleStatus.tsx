import type { ReactNode } from "react";

export interface SubtleStatusProps {
  children: ReactNode;
  tone?: "neutral" | "attn" | "ok";
  className?: string;
}

export function SubtleStatus({ children, tone = "neutral", className }: SubtleStatusProps) {
  const classes = [
    "orbit-substatus",
    tone === "neutral" ? null : `orbit-substatus--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{children}</span>;
}
