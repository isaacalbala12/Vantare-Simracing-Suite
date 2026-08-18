import { createElement, type HTMLAttributes, type ReactNode } from "react";

/** `title` se reescribe como `ReactNode` (cabecera), así que tapa el `title`
 *  nativo de `HTMLAttributes`: el kit no usa el atributo `title` del DOM. */
export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  as?: "section" | "aside" | "article";
  /** Columna flexible con cuerpo scrollable y `min-height: 0`. */
  fill?: boolean;
}

export function Surface({
  title,
  meta,
  actions,
  as = "section",
  fill,
  className,
  children,
  ...rest
}: SurfaceProps) {
  const classes = ["orbit-surface", fill ? "orbit-surface--fill" : null, className]
    .filter(Boolean)
    .join(" ");

  return createElement(
    as,
    { className: classes, ...rest },
    title || meta || actions ? (
      <header className="orbit-surface__head">
        {title ? <h3>{title}</h3> : <span className="orbit-surface__head-spacer" />}
        {meta ? <span className="orbit-surface__meta">{meta}</span> : null}
        {actions ? <span className="orbit-surface__actions">{actions}</span> : null}
      </header>
    ) : null,
    <div className="orbit-surface__body">{children}</div>,
  );
}
