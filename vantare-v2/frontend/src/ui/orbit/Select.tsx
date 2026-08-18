import type { CSSProperties } from "react";

export interface SelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
  label: string;
  width?: number;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  width,
  id,
  disabled,
  className,
}: SelectProps<T>) {
  return (
    <select
      aria-label={label}
      className={["orbit-select", className].filter(Boolean).join(" ")}
      disabled={disabled}
      id={id}
      onChange={(event) => onChange(event.target.value as T)}
      style={width ? ({ "--orbit-select-w": `${width}px` } as CSSProperties) : undefined}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
