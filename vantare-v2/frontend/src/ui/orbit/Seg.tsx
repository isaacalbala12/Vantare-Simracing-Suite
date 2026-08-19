import type { ReactNode } from "react";

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  /** Texto accesible extra; se pinta como tooltip propio, no como `title`. */
  title?: string;
}

export interface SegProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange(v: T): void;
  wide?: boolean;
  /** `aria-label` del grupo. */
  label: string;
  className?: string;
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  wide,
  label,
  className,
}: SegProps<T>) {
  const classes = ["orbit-seg", wide ? "orbit-seg--wide" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div aria-label={label} className={classes} role="group">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className="orbit-seg__option"
          data-tip={option.title}
          data-tip-side="top"
          disabled={option.disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface SegMultiProps<T extends string> {
  options: SegOption<T>[];
  /** Valores activos; el grupo es multi-seleccion (`aria-pressed` por boton). */
  values: readonly T[];
  onToggle(v: T, next: boolean): void;
  wide?: boolean;
  /** `aria-label` del grupo. */
  label: string;
  className?: string;
}

/** Variante multi-seleccion del `Seg`: mismos botones, varios activos a la vez. */
export function SegMulti<T extends string>({
  options,
  values,
  onToggle,
  wide,
  label,
  className,
}: SegMultiProps<T>) {
  const classes = ["orbit-seg", wide ? "orbit-seg--wide" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div aria-label={label} className={classes} role="group">
      {options.map((option) => {
        const active = values.includes(option.value);
        return (
          <button
            aria-pressed={active}
            className="orbit-seg__option"
            data-tip={option.title}
            data-tip-side="top"
            disabled={option.disabled}
            key={option.value}
            onClick={() => onToggle(option.value, !active)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
