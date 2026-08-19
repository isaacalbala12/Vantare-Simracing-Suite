export interface ToggleProps {
  pressed: boolean;
  onChange(v: boolean): void;
  label: string;
  disabled?: boolean;
  /** Motivo cuando está deshabilitado: tooltip propio, nunca `title` nativo. */
  title?: string;
  className?: string;
}

/** Interruptor 44×25 con knob spring de 220 ms (`07-motion.md`). */
export function Toggle({ pressed, onChange, label, disabled, title, className }: ToggleProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={["orbit-toggle", className].filter(Boolean).join(" ")}
      data-tip={title}
      data-tip-side="top"
      disabled={disabled}
      onClick={() => onChange(!pressed)}
      type="button"
    />
  );
}
