import type { ReactNode } from "react";
import { cx } from "./cx";

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
  as?: "button" | "div";
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
  as: Element = "button",
}: ListRowProps) {
  const classes = cx("orbit-row", selected ? "orbit-row--sel" : null, next ? "orbit-row--next" : null, className);

  return (
    <Element
      aria-selected={ariaSelected}
      className={classes}
      draggable={draggable}
      onClick={onClick}
      role={role}
      {...(Element === "button" ? { type: "button" as const } : {})}
    >
      {leading}
      <span className="orbit-row__copy">
        <b>{title}</b>
        {subtitle ? <span>{subtitle}</span> : null}
      </span>
      {trailing}
    </Element>
  );
}
