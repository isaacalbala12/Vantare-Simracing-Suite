import type { ReactNode } from "react";

export interface PillProps {
  children: ReactNode;
  dot?: "ok" | "gold" | "ring" | "ring-gold" | "none";
  pulse?: boolean;
  onClick?(): void;
  title?: string;
  className?: string;
  /** Estado semántico del pill; alimenta el color y la pulsación del punto. */
  state?: string;
}

export function Pill({
  children,
  dot = "none",
  pulse,
  onClick,
  title,
  className,
  state,
}: PillProps) {
  const content = (
    <>
      {dot === "none" ? null : (
        <i className={`orbit-pill__dot orbit-pill__dot--${dot}`} aria-hidden="true" />
      )}
      <span className="orbit-pill__label">{children}</span>
    </>
  );
  const classes = ["orbit-pill", pulse ? "orbit-pill--pulse" : null, className]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button className={classes} data-s={state} onClick={onClick} title={title} type="button">
        {content}
      </button>
    );
  }
  return (
    <span className={classes} data-s={state} title={title}>
      {content}
    </span>
  );
}
