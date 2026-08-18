import type { HTMLAttributes } from "react";

export interface FeaturedProps extends HTMLAttributes<HTMLElement> {
  /** Clicable: se renderiza como `button` con hover elevado. */
  interactive?: boolean;
}

/** Superficie destacada con borde degradado carmín. Máximo dos por pantalla. */
export function Featured({ interactive, className, children, ...rest }: FeaturedProps) {
  const classes = [
    "orbit-featured",
    interactive ? "orbit-featured--interactive" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (interactive) {
    return (
      <button className={classes} type="button" {...(rest as HTMLAttributes<HTMLButtonElement>)}>
        {children}
      </button>
    );
  }
  return (
    <section className={classes} {...rest}>
      {children}
    </section>
  );
}
