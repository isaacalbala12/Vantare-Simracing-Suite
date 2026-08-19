import type { ReactNode } from "react";

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  /** Primera salida de la lista: la hora se resalta en coral. */
  next?: boolean;
  onClick?(): void;
  draggable?: boolean;
  role?: "option" | "button";
  ariaSelected?: boolean;
  className?: string;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  selected,
  next,
  onClick,
  draggable,
  role,
  ariaSelected,
  className,
}: ListRowProps) {
  const classes = [
    "orbit-row",
    selected ? "orbit-row--sel" : null,
    next ? "orbit-row--next" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      aria-selected={ariaSelected}
      className={classes}
      draggable={draggable}
      onClick={onClick}
      role={role}
      type="button"
    >
      {leading}
      <span className="orbit-row__copy">
        <b>{title}</b>
        {subtitle ? <span>{subtitle}</span> : null}
      </span>
      {trailing}
    </button>
  );
}
