export interface ToggleProps {
  pressed: boolean;
  onChange(v: boolean): void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** Interruptor 44×25 con knob spring de 220 ms (`07-motion.md`). */
export function Toggle({ pressed, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={["orbit-toggle", className].filter(Boolean).join(" ")}
      disabled={disabled}
      onClick={() => onChange(!pressed)}
      type="button"
    />
  );
}
