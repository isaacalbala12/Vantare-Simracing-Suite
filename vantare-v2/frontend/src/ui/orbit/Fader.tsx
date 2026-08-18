export interface FaderProps {
  /** Posición 0–1. */
  value: number;
  className?: string;
}

/**
 * Fader (`04 · .fader`): 150×6 con relleno carmín→coral y knob de 16px.
 * Decorativo en el prototipo, así que queda fuera del árbol de accesibilidad.
 */
export function Fader({ value, className }: FaderProps) {
  const pct = `${Math.min(100, Math.max(0, value * 100))}%`;
  return (
    <span
      aria-hidden="true"
      className={["orbit-fader", className].filter(Boolean).join(" ")}
      data-testid="orbit-fader"
    >
      <i style={{ width: pct }} />
      <b style={{ left: pct }} />
    </span>
  );
}
