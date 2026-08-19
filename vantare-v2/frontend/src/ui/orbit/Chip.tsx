import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { Tone } from "./Button";

export interface ChipProps {
  children: ReactNode;
  tier?: "bronze" | "silver" | "gold";
  tone?: Tone;
  /** Caja normal 11px con icono (Estrategia, capacidades). */
  caseNormal?: boolean;
  icon?: IconName;
  className?: string;
}

export function Chip({ children, tier, tone, caseNormal, icon, className }: ChipProps) {
  const classes = [
    "orbit-chip",
    tier ? `orbit-chip--${tier}` : null,
    tone && tone !== "neutral" ? `orbit-chip--${tone}` : null,
    caseNormal ? "orbit-chip--case-normal" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {tier ? <i aria-hidden="true" className="orbit-chip__dot" /> : null}
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}
