import type { ReactNode } from "react";

export interface PillProps {
  children: ReactNode;
  dot?: "ok" | "gold" | "ring" | "ring-gold" | "none";
  pulse?: boolean;
  onClick?(): void;
  /** Texto largo del estado: se expone como `aria-label`, **no** como `title`. */
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
        <i aria-hidden="true" className={`orbit-pill__dot orbit-pill__dot--${dot}`} />
      )}
      <span className="orbit-pill__label">{children}</span>
    </>
  );
  const classes = ["orbit-pill", pulse ? "orbit-pill--pulse" : null, className]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button
        aria-label={title}
        className={classes}
        data-s={state}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <span aria-label={title} className={classes} data-s={state}>
      {content}
    </span>
  );
}
