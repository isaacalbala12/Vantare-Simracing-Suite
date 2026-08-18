import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Alineado a la derecha y en mono (`.num`). */
  numeric?: boolean;
  /** Unidad visible junto al campo (`08 · formularios`). */
  unit?: string;
}

export function Input({ numeric, unit, className, ...rest }: InputProps) {
  const classes = ["orbit-input", numeric ? "orbit-input--num" : null, className]
    .filter(Boolean)
    .join(" ");
  const input = <input className={classes} type={rest.type ?? "text"} {...rest} />;

  if (!unit) return input;
  return (
    <span className="orbit-input-wrap">
      {input}
      <span aria-hidden="true" className="orbit-input__unit">
        {unit}
      </span>
    </span>
  );
}
