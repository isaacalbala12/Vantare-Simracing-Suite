import type { ReactNode } from "react";

export interface CheckProps {
  checked: boolean;
  onChange?(v: boolean): void;
  /** Nombre accesible cuando la copia visible no basta. */
  label?: string;
  disabled?: boolean;
  /** Copia de la fila (título + ayuda). Va dentro del propio control. */
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * Casilla del kit: caja 18×18 con marca carmín, sin `input` nativo, para que
 * los consentimientos y los ajustes booleanos de lista tengan el mismo aspecto
 * en todas las pantallas (`04-componentes.md`).
 */
export function Check({ checked, onChange, label, disabled, children, className, ...rest }: CheckProps) {
  return (
    <button
      {...rest}
      aria-checked={checked}
      aria-label={label}
      className={["orbit-check", className].filter(Boolean).join(" ")}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      role="checkbox"
      type="button"
    >
      <span aria-hidden="true" className="orbit-check__box">
        <svg fill="none" focusable="false" height={10} viewBox="0 0 12 10" width={12}>
          <path
            d="M1 5.2 4.3 8.5 11 1.6"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
      </span>
      {children ? <span className="orbit-check__copy">{children}</span> : null}
    </button>
  );
}
