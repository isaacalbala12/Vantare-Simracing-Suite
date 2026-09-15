import type { ReactNode } from "react";
import { cx } from "./cx";

export interface FieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  /** Par etiqueta–control en una línea (`.field-row`). */
  row?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, htmlFor, row, children, className }: FieldProps) {
  const classes = cx(row ? "orbit-field orbit-field--row" : "orbit-field", className);

  return (
    <div className={classes}>
      <label htmlFor={htmlFor}>
        {label}
        {hint ? <span className="orbit-field__hint">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}
