import type { ReactNode } from "react";

export interface StatTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: string;
  tone?: "neutral" | "hot" | "ok";
  className?: string;
}

export function StatTile({ label, value, unit, sub, tone = "neutral", className }: StatTileProps) {
  const classes = ["orbit-stat", tone === "neutral" ? null : `orbit-stat--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <span className="orbit-stat__k">{label}</span>
      <span className="orbit-stat__v">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      {sub ? <span className="orbit-stat__s">{sub}</span> : null}
    </div>
  );
}

export interface StatRowProps {
  children: ReactNode;
  className?: string;
}

/** Rejilla de 4 columnas con `--orbit-space` (`04 · stat-row`). */
export function StatRow({ children, className }: StatRowProps) {
  return <div className={["orbit-stat-row", className].filter(Boolean).join(" ")}>{children}</div>;
}
