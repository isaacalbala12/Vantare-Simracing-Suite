import type { CSSProperties } from "react";

export interface MonogramProps {
  text: string;
  /** Degradado de la app (`gradientFrom`/`gradientTo` del contrato del launcher). */
  g1: string;
  g2: string;
  size?: 26 | 32 | 39 | 46 | 52 | 60;
  className?: string;
}

export function Monogram({ text, g1, g2, size = 39, className }: MonogramProps) {
  return (
    <span
      aria-hidden="true"
      className={["orbit-monogram", `orbit-monogram--${size}`, className]
        .filter(Boolean)
        .join(" ")}
      style={{ "--orbit-mono-g1": g1, "--orbit-mono-g2": g2 } as CSSProperties}
    >
      {text}
    </span>
  );
}
