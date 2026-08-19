import type { CSSProperties } from "react";

export interface DotProps {
  variant?: "ok" | "gold" | "ring" | "ring-gold" | "neutral";
  /** Punto de licencia de 7px (`.tier-dot`). */
  tier?: "bronze" | "silver" | "gold";
  className?: string;
}

const TIER_TOKEN = {
  bronze: "var(--orbit-tier-bronze)",
  silver: "var(--orbit-tier-silver)",
  gold: "var(--orbit-tier-gold)",
} as const;

export function Dot({ variant = "neutral", tier, className }: DotProps) {
  const classes = [
    "orbit-dot",
    variant === "neutral" ? null : `orbit-dot--${variant}`,
    tier ? "orbit-dot--tier" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <i
      aria-hidden="true"
      className={classes}
      style={tier ? ({ color: TIER_TOKEN[tier] } as CSSProperties) : undefined}
    />
  );
}
